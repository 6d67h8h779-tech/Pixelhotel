(() => {
  "use strict";

  const STICKERS = [
    "😀","😂","😍","😎","🥳","😢","😡","😱","👍","👎","🙏","👏",
    "🔥","🎉","❤️","💯","🤔","😴","🍕","🎮","⚽","🐶","🐱","🚀"
  ];

  const state = {
    token: localStorage.getItem("mc_token") || null,
    user: null,
    friends: [],
    rooms: [],
    activeRoomId: null,
    activeRoomInfo: null,
    lastMessageTs: {},
    pollTimer: null,
    roomsPollTimer: null,
  };

  // ---------- API helper ----------
  async function api(path, opts = {}) {
    const headers = Object.assign({}, opts.headers || {});
    if (state.token) headers["Authorization"] = "Bearer " + state.token;
    if (opts.body && !(opts.body instanceof FormData)) {
      headers["Content-Type"] = "application/json";
    }
    const res = await fetch(path, Object.assign({}, opts, { headers }));
    let data = null;
    try { data = await res.json(); } catch (e) { /* ignore */ }
    if (!res.ok) {
      const message = (data && data.error) || ("Fehler " + res.status);
      throw new Error(message);
    }
    return data;
  }

  function fileUrl(fileId) {
    return "/file/" + fileId;
  }

  function initials(name) {
    if (!name) return "?";
    return name.trim().slice(0, 2).toUpperCase();
  }

  function avatarHtml(name, fileId, extraClass) {
    if (fileId) {
      return `<div class="avatar ${extraClass||""}"><img src="${fileUrl(fileId)}" alt=""></div>`;
    }
    return `<div class="avatar ${extraClass||""}">${initials(name)}</div>`;
  }

  // ---------- Auth screen ----------
  const authScreen = document.getElementById("auth-screen");
  const mainScreen = document.getElementById("main-screen");
  const authError = document.getElementById("auth-error");
  const loginForm = document.getElementById("login-form");
  const registerForm = document.getElementById("register-form");
  const toggleToRegister = document.getElementById("toggle-to-register");
  const toggleToLogin = document.getElementById("toggle-to-login");
  const authSubtitle = document.getElementById("auth-subtitle");

  toggleToRegister.querySelector("a").addEventListener("click", () => {
    loginForm.classList.add("hidden");
    registerForm.classList.remove("hidden");
    toggleToRegister.classList.add("hidden");
    toggleToLogin.classList.remove("hidden");
    authSubtitle.textContent = "Erstelle ein neues Konto";
    authError.textContent = "";
  });
  toggleToLogin.querySelector("a").addEventListener("click", () => {
    registerForm.classList.add("hidden");
    loginForm.classList.remove("hidden");
    toggleToLogin.classList.add("hidden");
    toggleToRegister.classList.remove("hidden");
    authSubtitle.textContent = "Melde dich an, um zu chatten";
    authError.textContent = "";
  });

  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    authError.textContent = "";
    const username = document.getElementById("login-username").value.trim();
    const password = document.getElementById("login-password").value;
    try {
      const data = await api("/api/login", { method: "POST", body: JSON.stringify({ username, password }) });
      onLoggedIn(data);
    } catch (err) {
      authError.textContent = err.message;
    }
  });

  registerForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    authError.textContent = "";
    const username = document.getElementById("register-username").value.trim();
    const displayName = document.getElementById("register-displayname").value.trim();
    const password = document.getElementById("register-password").value;
    try {
      const data = await api("/api/register", { method: "POST", body: JSON.stringify({ username, displayName, password }) });
      onLoggedIn(data);
    } catch (err) {
      authError.textContent = err.message;
    }
  });

  function onLoggedIn(data) {
    state.token = data.token;
    state.user = data.user;
    localStorage.setItem("mc_token", data.token);
    authScreen.classList.add("hidden");
    mainScreen.classList.remove("hidden");
    afterLogin();
  }

  document.getElementById("logout-btn").addEventListener("click", () => {
    localStorage.removeItem("mc_token");
    location.reload();
  });

  // ---------- Sidebar / rooms ----------
  const myAvatarEl = document.getElementById("my-avatar");
  const myNameEl = document.getElementById("my-name");
  const roomListEl = document.getElementById("room-list");

  async function loadMe(silent) {
    const data = await api("/api/me");
    state.user = data.user;
    state.friends = data.friends;
    state.rooms = data.rooms;
    renderMyProfile();
    renderRoomList();
    if (!silent) {}
  }

  function renderMyProfile() {
    myNameEl.textContent = state.user.displayName;
    myAvatarEl.outerHTML = avatarHtml(state.user.displayName, state.user.avatarFileId).replace('<div class="avatar', '<div id="my-avatar" class="avatar');
  }

  function renderRoomList() {
    if (!state.rooms.length) {
      roomListEl.innerHTML = `<div class="empty-hint">Noch keine Chats.<br>Füge einen Freund hinzu oder tritt einer Gruppe bei.</div>`;
      return;
    }
    roomListEl.innerHTML = "";
    state.rooms.forEach((room) => {
      const div = document.createElement("div");
      div.className = "room-item" + (room.roomId === state.activeRoomId ? " active" : "");
      div.innerHTML = `
        ${avatarHtml(room.name, room.avatarFileId)}
        <div class="meta">
          <div class="name">${escapeHtml(room.name)}${room.isGroup ? '<span class="code-badge">' + room.code + '</span>' : ""}</div>
          <div class="preview">${room.isGroup ? room.memberCount + " Mitglieder" : "Direktnachricht"}</div>
        </div>
      `;
      div.addEventListener("click", () => selectRoom(room));
      roomListEl.appendChild(div);
    });
  }

  function escapeHtml(s) {
    if (s === null || s === undefined) return "";
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  // ---------- Chat view ----------
  const chatPlaceholder = document.getElementById("chat-placeholder");
  const chatView = document.getElementById("chat-view");
  const chatTitle = document.getElementById("chat-title");
  const chatSub = document.getElementById("chat-sub");
  const chatAvatar = document.getElementById("chat-avatar");
  const chatCodePill = document.getElementById("chat-code-pill");
  const messagesEl = document.getElementById("messages");
  const sidebarEl = document.getElementById("sidebar");
  const chatPanelEl = document.getElementById("chat-panel");

  function selectRoom(room) {
    state.activeRoomId = room.roomId;
    state.activeRoomInfo = room;
    chatPlaceholder.classList.add("hidden");
    chatView.classList.remove("hidden");
    chatView.style.display = "flex";
    chatTitle.textContent = room.name;
    chatSub.textContent = room.isGroup ? room.memberCount + " Mitglieder" : "";
    chatAvatar.outerHTML = avatarHtml(room.name, room.avatarFileId).replace('<div class="avatar', '<div id="chat-avatar" class="avatar');
    if (room.isGroup) {
      chatCodePill.textContent = "Code: " + room.code;
      chatCodePill.classList.remove("hidden");
      chatCodePill.onclick = () => {
        navigator.clipboard?.writeText(room.code).catch(() => {});
        chatCodePill.textContent = "Kopiert!";
        setTimeout(() => (chatCodePill.textContent = "Code: " + room.code), 1200);
      };
    } else {
      chatCodePill.classList.add("hidden");
    }
    messagesEl.innerHTML = "";
    state.lastMessageTs[room.roomId] = 0;
    renderRoomList();
    loadMessages(true);
    // mobile view
    sidebarEl.classList.add("chat-open");
    chatPanelEl.classList.remove("hidden-mobile");
  }

  document.getElementById("btn-back").addEventListener("click", () => {
    sidebarEl.classList.remove("chat-open");
  });

  async function loadMessages(scrollToBottom) {
    const roomId = state.activeRoomId;
    if (!roomId) return;
    const since = state.lastMessageTs[roomId] || 0;
    try {
      const data = await api(`/api/messages?roomId=${encodeURIComponent(roomId)}&since=${since}`);
      if (roomId !== state.activeRoomId) return; // switched away meanwhile
      if (data.messages && data.messages.length) {
        data.messages.forEach(appendMessage);
        state.lastMessageTs[roomId] = data.messages[data.messages.length - 1].createdAt;
      }
      if (scrollToBottom) messagesEl.scrollTop = messagesEl.scrollHeight;
    } catch (err) {
      console.error(err);
    }
  }

  function appendMessage(m) {
    const isMe = m.sender === state.user.username;
    const row = document.createElement("div");
    row.className = "msg-row" + (isMe ? " me" : "");
    const time = new Date(m.createdAt).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });

    let inner = "";
    if (!isMe && state.activeRoomInfo && state.activeRoomInfo.isGroup) {
      inner += `<div class="sender">${escapeHtml(m.senderName)}</div>`;
    }
    if (m.type === "text") {
      inner += escapeHtml(m.content).replace(/\n/g, "<br>");
    } else if (m.type === "sticker") {
      inner += `<div class="sticker-emoji">${m.content}</div>`;
    } else if (m.type === "image" || m.type === "gif") {
      inner += `<img class="chat-image" src="${fileUrl(m.fileId)}" alt="${escapeHtml(m.fileName||"")}">`;
    } else if (m.type === "file") {
      inner += `<a href="${fileUrl(m.fileId)}" target="_blank" rel="noopener">📄 ${escapeHtml(m.fileName || "Datei")}</a>`;
    }
    inner += `<div class="time">${time}</div>`;

    const bubbleClass = "bubble" + (m.type === "file" ? " file-bubble" : "");
    row.innerHTML = `<div class="${bubbleClass}">${inner}</div>`;
    messagesEl.appendChild(row);
    const nearBottom = messagesEl.scrollHeight - messagesEl.scrollTop - messagesEl.clientHeight < 150;
    if (nearBottom) messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  // ---------- Sending ----------
  const textInput = document.getElementById("text-input");
  const btnSend = document.getElementById("btn-send");
  const btnSticker = document.getElementById("btn-sticker");
  const stickerPanel = document.getElementById("sticker-panel");
  const btnAttach = document.getElementById("btn-attach");
  const fileInput = document.getElementById("file-input");

  STICKERS.forEach((s) => {
    const b = document.createElement("button");
    b.textContent = s;
    b.addEventListener("click", () => {
      sendMessage({ type: "sticker", content: s });
      stickerPanel.classList.add("hidden");
    });
    stickerPanel.appendChild(b);
  });

  btnSticker.addEventListener("click", () => {
    stickerPanel.classList.toggle("hidden");
  });
  document.addEventListener("click", (e) => {
    if (!stickerPanel.contains(e.target) && e.target !== btnSticker) {
      stickerPanel.classList.add("hidden");
    }
  });

  async function sendMessage(payload) {
    if (!state.activeRoomId) return;
    try {
      await api("/api/messages", {
        method: "POST",
        body: JSON.stringify(Object.assign({ roomId: state.activeRoomId }, payload)),
      });
      loadMessages(true);
    } catch (err) {
      alert("Senden fehlgeschlagen: " + err.message);
    }
  }

  btnSend.addEventListener("click", sendText);
  textInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") sendText();
  });
  function sendText() {
    const val = textInput.value.trim();
    if (!val) return;
    textInput.value = "";
    sendMessage({ type: "text", content: val });
  }

  btnAttach.addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", async () => {
    const file = fileInput.files[0];
    fileInput.value = "";
    if (!file) return;
    if (file.size > 4.5 * 1024 * 1024) {
      alert("Datei ist zu groß (max. 4.5 MB).");
      return;
    }
    try {
      const base64 = await fileToBase64(file);
      const up = await api("/api/upload", {
        method: "POST",
        body: JSON.stringify({ filename: file.name, contentType: file.type, dataBase64: base64 }),
      });
      let type = "file";
      if (file.type === "image/gif") type = "gif";
      else if (file.type.startsWith("image/")) type = "image";
      await sendMessage({ type, fileId: up.fileId, fileName: file.name, mimeType: file.type });
    } catch (err) {
      alert("Upload fehlgeschlagen: " + err.message);
    }
  });

  function fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result.split(",")[1]);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  // ---------- Modals ----------
  const modalRoot = document.getElementById("modal-root");
  function closeModal() { modalRoot.innerHTML = ""; }
  function openModal(html) {
    modalRoot.innerHTML = `<div class="modal-overlay" id="modal-overlay"><div class="modal">${html}</div></div>`;
    document.getElementById("modal-overlay").addEventListener("click", (e) => {
      if (e.target.id === "modal-overlay") closeModal();
    });
  }

  document.getElementById("btn-add-friend").addEventListener("click", () => {
    openModal(`
      <h2>Freund hinzufügen</h2>
      <div class="error" id="m-error"></div>
      <input type="text" id="m-username" placeholder="Nutzername des Freundes" />
      <div class="row">
        <button class="secondary" id="m-cancel">Abbrechen</button>
        <button class="primary" id="m-submit">Hinzufügen</button>
      </div>
    `);
    document.getElementById("m-cancel").addEventListener("click", closeModal);
    document.getElementById("m-submit").addEventListener("click", async () => {
      const username = document.getElementById("m-username").value.trim();
      const errEl = document.getElementById("m-error");
      if (!username) return;
      try {
        await api("/api/friends", { method: "POST", body: JSON.stringify({ username }) });
        closeModal();
        await loadMe(true);
      } catch (err) {
        errEl.textContent = err.message;
      }
    });
  });

  document.getElementById("btn-create-group").addEventListener("click", () => {
    openModal(`
      <h2>Gruppe erstellen</h2>
      <div class="error" id="m-error"></div>
      <input type="text" id="m-groupname" placeholder="Gruppenname" />
      <div class="row">
        <button class="secondary" id="m-cancel">Abbrechen</button>
        <button class="primary" id="m-submit">Erstellen</button>
      </div>
    `);
    document.getElementById("m-cancel").addEventListener("click", closeModal);
    document.getElementById("m-submit").addEventListener("click", async () => {
      const name = document.getElementById("m-groupname").value.trim();
      const errEl = document.getElementById("m-error");
      if (!name) return;
      try {
        const data = await api("/api/rooms", { method: "POST", body: JSON.stringify({ action: "create", name }) });
        await loadMe(true);
        openModal(`
          <h2>Gruppe erstellt 🎉</h2>
          <p style="font-size:13px;color:var(--muted);margin-top:0;">Teile diesen Code mit Freunden, damit sie beitreten können:</p>
          <div class="success-code">${data.room.code}</div>
          <div class="row">
            <button class="primary" id="m-close" style="flex:1;">Fertig</button>
          </div>
        `);
        document.getElementById("m-close").addEventListener("click", closeModal);
      } catch (err) {
        errEl.textContent = err.message;
      }
    });
  });

  document.getElementById("btn-join-group").addEventListener("click", () => {
    openModal(`
      <h2>Gruppe beitreten</h2>
      <div class="error" id="m-error"></div>
      <input type="text" id="m-code" placeholder="Beitritts-Code (z.B. AB12CD)" style="text-transform:uppercase;" />
      <div class="row">
        <button class="secondary" id="m-cancel">Abbrechen</button>
        <button class="primary" id="m-submit">Beitreten</button>
      </div>
    `);
    document.getElementById("m-cancel").addEventListener("click", closeModal);
    document.getElementById("m-submit").addEventListener("click", async () => {
      const code = document.getElementById("m-code").value.trim();
      const errEl = document.getElementById("m-error");
      if (!code) return;
      try {
        await api("/api/rooms", { method: "POST", body: JSON.stringify({ action: "join", code }) });
        closeModal();
        await loadMe(true);
      } catch (err) {
        errEl.textContent = err.message;
      }
    });
  });

  document.getElementById("open-profile").addEventListener("click", () => {
    openModal(`
      <h2>Mein Profil</h2>
      <div class="error" id="m-error"></div>
      <div class="avatar-picker">
        ${avatarHtml(state.user.displayName, state.user.avatarFileId)}
        <label for="m-avatar-file">Profilbild ändern</label>
        <input type="file" id="m-avatar-file" accept="image/*" class="hidden" />
      </div>
      <input type="text" id="m-displayname" value="${escapeHtml(state.user.displayName)}" placeholder="Anzeigename" />
      <div class="row">
        <button class="secondary" id="m-cancel">Abbrechen</button>
        <button class="primary" id="m-submit">Speichern</button>
      </div>
    `);
    document.getElementById("m-cancel").addEventListener("click", closeModal);
    let pendingAvatarFileId = null;
    document.getElementById("m-avatar-file").addEventListener("change", async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      try {
        const base64 = await fileToBase64(file);
        const up = await api("/api/upload", {
          method: "POST",
          body: JSON.stringify({ filename: file.name, contentType: file.type, dataBase64: base64 }),
        });
        pendingAvatarFileId = up.fileId;
        document.querySelector(".avatar-picker .avatar").outerHTML = avatarHtml(state.user.displayName, up.fileId);
      } catch (err) {
        document.getElementById("m-error").textContent = "Upload fehlgeschlagen: " + err.message;
      }
    });
    document.getElementById("m-submit").addEventListener("click", async () => {
      const displayName = document.getElementById("m-displayname").value.trim();
      try {
        const payload = { displayName };
        if (pendingAvatarFileId) payload.avatarFileId = pendingAvatarFileId;
        const data = await api("/api/profile", { method: "POST", body: JSON.stringify(payload) });
        state.user = data.user;
        renderMyProfile();
        closeModal();
        await loadMe(true);
      } catch (err) {
        document.getElementById("m-error").textContent = err.message;
      }
    });
  });

  // ---------- Boot ----------
  async function afterLogin() {
    await loadMe();
    if (state.pollTimer) clearInterval(state.pollTimer);
    state.pollTimer = setInterval(() => loadMessages(false), 2500);
    if (state.roomsPollTimer) clearInterval(state.roomsPollTimer);
    state.roomsPollTimer = setInterval(() => loadMe(true).catch(() => {}), 6000);
  }

  (async function boot() {
    if (state.token) {
      try {
        authScreen.classList.add("hidden");
        mainScreen.classList.remove("hidden");
        await afterLogin();
        return;
      } catch (err) {
        localStorage.removeItem("mc_token");
        state.token = null;
        mainScreen.classList.add("hidden");
        authScreen.classList.remove("hidden");
      }
    }
  })();
})();
