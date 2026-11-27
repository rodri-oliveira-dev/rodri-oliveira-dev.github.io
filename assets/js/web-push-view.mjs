const CONTENT = Object.freeze({
  disabled: ["Notificações indisponíveis", "A ativação e o cancelamento ainda não estão disponíveis."],
  checking: ["Verificando disponibilidade", "Aguarde enquanto verificamos os recursos deste navegador."],
  "install-required": ["Instalação necessária no iPhone ou iPad", "Adicione este site à Tela de Início e abra-o pelo novo ícone antes de ativar notificações."],
  unsupported: ["Notificações não disponíveis", "Este navegador ou contexto não oferece os recursos necessários."],
  inactive: ["Notificações desativadas", "Você decide se quer receber avisos de novos artigos em português."],
  "permission-denied": ["Permissão bloqueada", "As notificações estão bloqueadas nas configurações do navegador. Nenhuma nova solicitação será exibida automaticamente."],
  activating: ["Ativando notificações", "Conclua a solicitação do navegador. Não feche esta página."],
  active: ["Notificações ativadas", "Este navegador pode receber avisos de novos artigos em português até a data informada."],
  "capability-lost": ["Notificações sem suporte neste contexto", "A inscrição ainda pode ser cancelada no serviço, mesmo que este navegador tenha perdido a capacidade local."],
  "canceling-remote": ["Cancelando notificações", "Primeiro estamos revogando a inscrição no serviço."],
  "canceling-local": ["Finalizando cancelamento", "A revogação foi aceita. Agora estamos removendo a inscrição deste navegador."],
  "cancel-pending-remote": ["Cancelamento pendente", "Não foi possível confirmar a revogação no serviço. Seus dados de cancelamento foram preservados para tentar novamente."],
  "cancel-pending-local": ["Revogação concluída", "O serviço não enviará novos avisos, mas este navegador ainda precisa concluir a limpeza local."],
  expired: ["Consentimento expirado", "A inscrição não será renovada automaticamente. Você ainda pode finalizar o cancelamento."],
  "recovery-required": ["Recuperação necessária", "A inscrição local não possui os dados necessários para gerenciamento. Use sua credencial de recuperação ou o canal de contato."],
  error: ["Não foi possível concluir", "Ocorreu uma falha recuperável. Nenhuma reinscrição será feita automaticamente."],
});

const BUSY_STATES = new Set(["checking", "activating", "canceling-remote", "canceling-local"]);

export class WebPushView {
  constructor(root, { documentLike = document, urlLike = URL, config = {} } = {}) {
    this.root = root;
    this.document = documentLike;
    this.url = urlLike;
    this.status = root.querySelector("[data-web-push-status]");
    this.description = root.querySelector("[data-web-push-description]");
    this.consent = root.querySelector("[data-web-push-consent]");
    this.consentInput = root.querySelector("[data-web-push-consent-input]");
    this.consentText = root.querySelector("[data-web-push-consent-text]");
    this.privacyLink = root.querySelector("[data-web-push-privacy]");
    this.activateButton = root.querySelector("[data-web-push-activate]");
    this.cancelButton = root.querySelector("[data-web-push-cancel]");
    this.retryButton = root.querySelector("[data-web-push-retry]");
    this.exportButton = root.querySelector("[data-web-push-export]");
    this.recovery = root.querySelector("[data-web-push-recovery]");
    this.recoveryId = root.querySelector("[data-web-push-recovery-id]");
    this.recoveryCapability = root.querySelector("[data-web-push-recovery-capability]");
    this.recoveryButton = root.querySelector("[data-web-push-recover]");
    if (config.enabled === true && typeof config.consentText === "string" && typeof config.privacyNoticeUrl === "string") {
      this.consentText.textContent = config.consentText;
      this.privacyLink.href = config.privacyNoticeUrl;
      this.privacyLink.hidden = false;
    }
  }

  bind(actions) {
    this.activateButton?.addEventListener("click", () => actions.activate(this.consentInput.checked === true));
    this.cancelButton?.addEventListener("click", () => actions.cancel());
    this.retryButton?.addEventListener("click", () => actions.retry());
    this.exportButton?.addEventListener("click", () => actions.exportRecovery());
    this.recoveryButton?.addEventListener("click", () => {
      const bundle = {
        subscriptionId: this.recoveryId.value.trim(),
        recoveryCapability: this.recoveryCapability.value.trim(),
      };
      this.recoveryId.value = "";
      this.recoveryCapability.value = "";
      actions.recover(bundle);
    });
    this.consentInput?.addEventListener("change", () => {
      this.activateButton.disabled = !this.consentInput.checked;
    });
  }

  render(state, { recoveryAvailable = false } = {}) {
    const [status, description] = CONTENT[state.name] || CONTENT.error;
    this.status.textContent = status;
    this.description.textContent = description;
    this.root.dataset.state = state.name;
    this.root.setAttribute("aria-busy", String(BUSY_STATES.has(state.name)));

    const inactive = state.name === "inactive";
    const cancelable = ["active", "capability-lost", "expired", "cancel-pending-remote"].includes(state.name);
    this.consent.hidden = !inactive;
    this.activateButton.hidden = !inactive;
    if (!inactive) this.consentInput.checked = false;
    this.activateButton.disabled = !inactive || !this.consentInput.checked;
    this.cancelButton.hidden = !cancelable;
    this.retryButton.hidden = !["cancel-pending-remote", "cancel-pending-local", "error"].includes(state.name);
    this.exportButton.hidden = !recoveryAvailable;
    this.recovery.hidden = state.name !== "recovery-required";
    const expiration = this.root.querySelector("[data-web-push-expiration]");
    expiration.hidden = true;
    expiration.textContent = "";
    if (state.name === "active" && state.detail?.expiresAtUtc) {
      expiration.hidden = false;
      expiration.textContent = `Validade: ${new Intl.DateTimeFormat("pt-BR", { dateStyle: "long" }).format(new Date(state.detail.expiresAtUtc))}.`;
    }
  }

  downloadRecovery(bundle) {
    const blob = new Blob([JSON.stringify({ version: 1, ...bundle }, null, 2)], { type: "application/json" });
    const objectUrl = this.url.createObjectURL(blob);
    const link = this.document.createElement("a");
    link.href = objectUrl;
    link.download = "recuperacao-notificacoes.json";
    link.rel = "noopener";
    link.click();
    this.url.revokeObjectURL(objectUrl);
  }
}

