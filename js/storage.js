(function (global) {
  "use strict";

  function get(key, fallback) {
    try {
      const value = global.localStorage.getItem(key);
      return value === null ? fallback : JSON.parse(value);
    } catch (error) {
      console.warn("Não foi possível ler os dados locais:", key, error);
      return fallback;
    }
  }

  function set(key, value) {
    try {
      global.localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (error) {
      console.error("Não foi possível salvar os dados locais:", key, error);
      return false;
    }
  }

  function remove(key) {
    try {
      global.localStorage.removeItem(key);
      return true;
    } catch (error) {
      console.error("Não foi possível remover os dados locais:", key, error);
      return false;
    }
  }

  global.storage = Object.freeze({ get, set, remove });
})(window);
