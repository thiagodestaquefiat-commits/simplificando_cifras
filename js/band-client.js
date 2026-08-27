(function (global) {
  "use strict";

  async function request(path, options) {
    const token = global.eventCollaboration.currentAccessToken();
    if (!token) throw new Error("Sincronize sua identidade antes de gerenciar equipes.");
    const response = await global.fetch(global.apiConfig.collaborationEndpoint("/bands" + (path || "")), {
      ...options,
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + token, ...options && options.headers }
    });
    const body = response.status === 204 ? null : await response.json().catch(() => null);
    if (!response.ok) throw new Error(body && body.erro && body.erro.mensagem || "Não foi possível atualizar a equipe.");
    return body;
  }

  async function list() { const body = await request("", { method: "GET" }); return body.bands || []; }
  async function create(values) { return request("", { method: "POST", body: JSON.stringify(values) }); }
  async function addMember(bandId, values) { return request("/" + encodeURIComponent(bandId) + "/members", { method: "POST", body: JSON.stringify(values) }); }
  async function updateMember(bandId, userId, values) { return request("/" + encodeURIComponent(bandId) + "/members/" + encodeURIComponent(userId), { method: "PATCH", body: JSON.stringify(values) }); }
  async function removeMember(bandId, userId) { return request("/" + encodeURIComponent(bandId) + "/members/" + encodeURIComponent(userId), { method: "DELETE" }); }

  global.bandClient = Object.freeze({ list, create, addMember, updateMember, removeMember });
})(window);
