(() => {
  const buttons = [...document.querySelectorAll(".lang-button")];
  const translated = [...document.querySelectorAll("[data-en][data-pt]")];
  const supported = new Set(["en", "pt"]);

  const browserLanguage = (navigator.language || "").toLowerCase().startsWith("pt") ? "pt" : "en";
  const savedLanguage = localStorage.getItem("portfolio-language");
  const initialLanguage = supported.has(savedLanguage) ? savedLanguage : browserLanguage;

  function setLanguage(language) {
    if (!supported.has(language)) return;

    document.documentElement.lang = language === "pt" ? "pt-BR" : "en";

    translated.forEach((element) => {
      element.textContent = element.dataset[language];
    });

    buttons.forEach((button) => {
      const active = button.dataset.lang === language;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
    });

    localStorage.setItem("portfolio-language", language);
  }

  buttons.forEach((button) => {
    button.addEventListener("click", () => setLanguage(button.dataset.lang));
  });

  const year = document.getElementById("year");
  if (year) year.textContent = new Date().getFullYear();

  setLanguage(initialLanguage);
})();
