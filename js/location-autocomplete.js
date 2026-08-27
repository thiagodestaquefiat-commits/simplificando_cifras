(function (global) {
  "use strict";

  class LocationAutocomplete {
    constructor(options) {
      this.input = options.input;
      this.list = options.list;
      this.status = options.status;
      this.preview = options.preview;
      this.onSelect = options.onSelect || function () {};
      this.selected = global.locationService.normalize(options.initialLocation);
      this.results = [];
      this.activeIndex = -1;
      this.timer = null;
      this.controller = null;
      this.sequence = 0;
      this.onInput = this.handleInput.bind(this);
      this.onKeyDown = this.handleKeyDown.bind(this);
      this.input.addEventListener("input", this.onInput);
      this.input.addEventListener("keydown", this.onKeyDown);
      global.eventMapPreview.render(this.preview, this.selected, { compact: true });
    }

    announce(message) { this.status.textContent = message || ""; }
    close() {
      this.results = [];
      this.activeIndex = -1;
      this.list.replaceChildren();
      this.list.hidden = true;
      this.input.setAttribute("aria-expanded", "false");
      this.input.removeAttribute("aria-activedescendant");
    }

    handleInput() {
      clearTimeout(this.timer);
      if (this.controller) this.controller.abort();
      const query = this.input.value.trim();
      if (this.selected && query !== this.selected.formattedAddress) {
        this.selected = null;
        this.onSelect(null);
        global.eventMapPreview.render(this.preview, null);
      }
      if (query.length < 4) {
        this.close();
        this.announce(query ? "Digite pelo menos 4 caracteres." : "");
        return;
      }
      this.announce("Aguardando para buscar…");
      this.timer = setTimeout(() => this.load(query), 400);
    }

    async load(query) {
      const sequence = ++this.sequence;
      this.controller = new AbortController();
      this.announce("Buscando endereços…");
      try {
        const results = await global.locationService.search(query, { signal: this.controller.signal });
        if (sequence !== this.sequence) return;
        this.results = results;
        this.activeIndex = -1;
        this.renderResults();
        this.announce(results.length ? results.length + " endereço(s) encontrado(s)." : "Nenhum endereço encontrado. Você ainda pode salvar o texto digitado.");
      } catch (error) {
        if (error && error.name === "AbortError") return;
        this.close();
        this.announce(error.message || "Não foi possível buscar endereços agora.");
        this.status.classList.add("error");
      }
    }

    renderResults() {
      this.list.replaceChildren();
      this.results.forEach((location, index) => {
        const option = document.createElement("button");
        option.type = "button";
        option.className = "location-option";
        option.id = "location-option-" + index;
        option.setAttribute("role", "option");
        option.setAttribute("aria-selected", String(index === this.activeIndex));
        const strong = document.createElement("strong");
        strong.textContent = location.name || location.street || location.city || "Local";
        const span = document.createElement("span");
        span.textContent = location.formattedAddress;
        option.append(strong, span);
        option.addEventListener("click", () => this.select(index));
        this.list.append(option);
      });
      this.list.hidden = this.results.length === 0;
      this.input.setAttribute("aria-expanded", String(this.results.length > 0));
    }

    setActive(index) {
      if (!this.results.length) return;
      this.activeIndex = (index + this.results.length) % this.results.length;
      this.renderResults();
      const active = this.list.children[this.activeIndex];
      this.input.setAttribute("aria-activedescendant", active.id);
      active.scrollIntoView({ block: "nearest" });
    }

    handleKeyDown(event) {
      if (event.key === "ArrowDown") { event.preventDefault(); this.setActive(this.activeIndex + 1); }
      else if (event.key === "ArrowUp") { event.preventDefault(); this.setActive(this.activeIndex - 1); }
      else if (event.key === "Enter" && this.activeIndex >= 0) { event.preventDefault(); this.select(this.activeIndex); }
      else if (event.key === "Escape") { this.close(); }
    }

    select(index) {
      const value = this.results[index];
      if (!value) return;
      this.selected = value;
      this.input.value = value.formattedAddress;
      this.onSelect(value);
      this.close();
      this.announce("Endereço selecionado e coordenadas salvas.");
      this.status.classList.remove("error");
      global.eventMapPreview.render(this.preview, value, { compact: true });
    }

    destroy() {
      clearTimeout(this.timer);
      if (this.controller) this.controller.abort();
      this.input.removeEventListener("input", this.onInput);
      this.input.removeEventListener("keydown", this.onKeyDown);
    }
  }

  global.LocationAutocomplete = LocationAutocomplete;
})(window);
