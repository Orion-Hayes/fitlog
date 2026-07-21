(() => {
  const config = window.FITLOG_SUPABASE_CONFIG || {};
  const isConfigured = Boolean(config.url && config.anonKey && window.supabase);
  let client = null;
  let currentUser = null;
  let syncTimer = null;
  let periodicSync = null;
  let ui = {};

  window.fitlogCloud = {
    open,
    scheduleSync,
  };

  document.addEventListener("DOMContentLoaded", boot);
  window.addEventListener("fitlogready", boot);

  function boot() {
    if (ui.modal || !window.fitlogStateApi) return;
    bindUi();

    if (!isConfigured) {
      renderAccount();
      return;
    }

    client = window.supabase.createClient(config.url, config.anonKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    });
    client.auth.onAuthStateChange((_event, session) => {
      currentUser = session?.user || null;
      renderAccount();
      if (currentUser) syncNow();
    });
    client.auth.getSession().then(({ data }) => {
      currentUser = data.session?.user || null;
      renderAccount();
      if (currentUser) syncNow();
    });

    window.addEventListener("online", scheduleSync);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") syncNow();
    });
    periodicSync = window.setInterval(syncNow, 60_000);
  }

  function bindUi() {
    ui = {
      modal: document.getElementById("syncModal"),
      signedOut: document.getElementById("syncSignedOut"),
      signedIn: document.getElementById("syncSignedIn"),
      form: document.getElementById("authForm"),
      email: document.getElementById("authEmail"),
      password: document.getElementById("authPassword"),
      signUp: document.getElementById("signUpBtn"),
      signOut: document.getElementById("signOutBtn"),
      syncNow: document.getElementById("syncNowBtn"),
      userEmail: document.getElementById("syncUserEmail"),
      status: document.getElementById("syncStatus"),
      message: document.getElementById("syncMessage"),
    };

    document.querySelectorAll("[data-close-sync]").forEach((button) => {
      button.addEventListener("click", close);
    });
    ui.form.addEventListener("submit", signIn);
    ui.signUp.addEventListener("click", signUp);
    ui.signOut.addEventListener("click", signOut);
    ui.syncNow.addEventListener("click", syncNow);
  }

  function open() {
    if (!ui.modal) return;
    ui.modal.classList.add("open");
    ui.modal.setAttribute("aria-hidden", "false");
    renderAccount();
    if (currentUser) syncNow();
  }

  function close() {
    ui.modal.classList.remove("open");
    ui.modal.setAttribute("aria-hidden", "true");
  }

  function renderAccount() {
    if (!ui.modal) return;
    const signedIn = Boolean(currentUser);
    ui.signedOut.hidden = signedIn || !isConfigured;
    ui.signedIn.hidden = !signedIn;
    if (!isConfigured) {
      setMessage("云端同步正在配置中。完成数据库连接后，这里就可以登录和同步。", "info");
      return;
    }
    if (signedIn) {
      ui.userEmail.textContent = currentUser.email || "已登录账号";
      ui.status.textContent = navigator.onLine ? "已开启自动同步" : "离线记录中，联网后会同步";
    } else {
      setMessage("");
    }
  }

  async function signIn(event) {
    event.preventDefault();
    if (!client) return;
    setMessage("正在登录...");
    const { error } = await client.auth.signInWithPassword({
      email: ui.email.value.trim(),
      password: ui.password.value,
    });
    setMessage(error ? readableError(error) : "登录成功，正在合并你的训练记录。", error ? "error" : "success");
  }

  async function signUp() {
    if (!client || !ui.form.reportValidity()) return;
    setMessage("正在创建账号...");
    const { data, error } = await client.auth.signUp({
      email: ui.email.value.trim(),
      password: ui.password.value,
    });
    if (error) {
      setMessage(readableError(error), "error");
      return;
    }
    if (!data.session) {
      setMessage("账号已创建。请先到邮箱确认，再回来登录。", "success");
      return;
    }
    setMessage("账号已创建，正在同步训练记录。", "success");
  }

  async function signOut() {
    if (!client) return;
    await client.auth.signOut();
    currentUser = null;
    renderAccount();
    setMessage("已退出。手机中的本地记录不会被删除。", "info");
  }

  function scheduleSync() {
    if (!currentUser || !navigator.onLine) return;
    window.clearTimeout(syncTimer);
    syncTimer = window.setTimeout(syncNow, 800);
  }

  async function syncNow() {
    if (!client || !currentUser || !navigator.onLine || !window.fitlogStateApi) return;
    setSyncStatus("正在同步...");
    const { data: remote, error: readError } = await client
      .from("workout_snapshots")
      .select("data")
      .eq("user_id", currentUser.id)
      .maybeSingle();
    if (readError) {
      setSyncStatus("同步失败");
      setMessage(readableError(readError), "error");
      return;
    }

    const merged = mergeStates(window.fitlogStateApi.getState(), remote?.data);
    window.fitlogStateApi.replaceState(merged);
    const { error: writeError } = await client.from("workout_snapshots").upsert({
      user_id: currentUser.id,
      data: merged,
      updated_at: new Date().toISOString(),
    });
    if (writeError) {
      setSyncStatus("同步失败");
      setMessage(readableError(writeError), "error");
      return;
    }
    setSyncStatus("刚刚已同步");
    setMessage("", "success");
  }

  function mergeStates(local, remote) {
    const safeLocal = normalizeState(local);
    const safeRemote = normalizeState(remote);
    const deletedRecordIds = unique([...safeLocal.deletedRecordIds, ...safeRemote.deletedRecordIds]);
    const deletedExerciseIds = unique([...safeLocal.deletedExerciseIds, ...safeRemote.deletedExerciseIds]);
    return {
      exercises: mergeById(safeLocal.exercises, safeRemote.exercises, deletedExerciseIds),
      records: mergeById(safeLocal.records, safeRemote.records, deletedRecordIds),
      deletedExerciseIds,
      deletedRecordIds,
    };
  }

  function normalizeState(value) {
    return {
      exercises: Array.isArray(value?.exercises) ? value.exercises : [],
      records: Array.isArray(value?.records) ? value.records : [],
      deletedExerciseIds: Array.isArray(value?.deletedExerciseIds) ? value.deletedExerciseIds : [],
      deletedRecordIds: Array.isArray(value?.deletedRecordIds) ? value.deletedRecordIds : [],
    };
  }

  function mergeById(first, second, deletedIds) {
    const deleted = new Set(deletedIds);
    const merged = new Map();
    [...first, ...second].forEach((item) => {
      if (item?.id && !deleted.has(item.id)) merged.set(item.id, item);
    });
    return [...merged.values()];
  }

  function unique(items) {
    return [...new Set(items.filter(Boolean))];
  }

  function setSyncStatus(text) {
    if (ui.status && currentUser) ui.status.textContent = text;
  }

  function setMessage(message, type = "") {
    if (!ui.message) return;
    ui.message.textContent = message;
    ui.message.dataset.type = type;
  }

  function readableError(error) {
    if (error.code === "42P01") return "云端数据表尚未准备好，请完成数据库设置后再试。";
    if (error.message?.toLowerCase().includes("invalid login")) return "邮箱或密码不正确。";
    if (error.message?.toLowerCase().includes("email not confirmed")) return "请先到邮箱中确认账号。";
    return "暂时无法同步，请检查网络后重试。";
  }
})();
