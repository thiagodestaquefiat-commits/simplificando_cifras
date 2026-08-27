(function (global) {
  "use strict";

  function render(container, location, options) {
    if (!container) return;
    const value = global.locationService.normalize(location);
    container.replaceChildren();
    container.hidden = !value;
    if (!value) return;
    const figure = document.createElement("figure");
    figure.className = "event-map-card" + (options && options.compact ? " compact" : "");
    const image = document.createElement("img");
    image.loading = "lazy";
    image.alt = "Mapa de " + (value.formattedAddress || value.name || "local do evento");
    image.src = global.locationService.mapUrl(value, options && options.compact ? { width: 640, height: 240 } : { width: 900, height: 360 });
    image.addEventListener("error", () => {
      image.hidden = true;
      const message = document.createElement("div");
      message.className = "event-map-error";
      message.textContent = "A prévia do mapa não está disponível agora. O endereço continua salvo.";
      figure.prepend(message);
    }, { once: true });
    const caption = document.createElement("figcaption");
    const address = document.createElement("span");
    address.textContent = value.formattedAddress || value.name;
    const link = document.createElement("a");
    link.href = global.locationService.externalMapUrl(value);
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = "Abrir no mapa ↗";
    const attribution = document.createElement("small");
    attribution.innerHTML = 'Mapa: <a href="https://www.geoapify.com/" target="_blank" rel="noopener noreferrer">Geoapify</a> · © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a>';
    caption.append(address, link, attribution);
    figure.append(image, caption);
    container.append(figure);
  }

  global.eventMapPreview = Object.freeze({ render });
})(window);
