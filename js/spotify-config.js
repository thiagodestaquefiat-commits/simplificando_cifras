(function (global) {
  "use strict";

  function defaultRedirectUri() {
    if (!global.location || global.location.protocol === "file:") return "http://127.0.0.1:4173/";
    return new URL("./", global.location.href).href.split("?")[0].split("#")[0];
  }

  global.spotifyConfig = Object.freeze({
    clientId: "f3ea3239c97644de99789061ad9a94b6",
    redirectUri: defaultRedirectUri(),
    scopes: Object.freeze([
      "streaming",
      "user-read-private",
      "user-read-email",
      "user-read-playback-state",
      "user-modify-playback-state"
    ])
  });
})(window);
