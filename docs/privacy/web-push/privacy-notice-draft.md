# Aviso de privacidade do Web Push — versão candidata

> **VERSÃO CANDIDATA PARA REVISÃO JURÍDICA — PUBLICAÇÃO AINDA NÃO AUTORIZADA**
>
> Versão documental: `1.0.0` · elaborada em 26/11/2026 e consolidada em 27/11/2026 · publicação condicionada à revisão jurídica e à release manual.

A versão pública candidata está integrada à seção `#privacidade-web-push` da homepage PT-BR. O recurso, a API pública e os envios permanecem desativados. Se a revisão jurídica exigir mudança material, a versão e o contrato do backend devem ser atualizados antes de qualquer inscrição; uma versão já usada como evidência de consentimento não pode ter seu significado alterado silenciosamente.

## Quem controla os dados

Rodrigo de Oliveira, responsável pelo portfólio `rodri-oliveira-dev.github.io`, é o controlador proposto para o tratamento descrito nesta minuta. O canal público existente para assuntos de privacidade é `rodrigodotnet@outlook.com`, já exibido na seção de contato do portfólio.

O enquadramento do controlador e dos demais agentes ainda depende de revisão jurídica. O envio de e-mail envolve o provedor de e-mail escolhido pelo remetente e o serviço Outlook/Microsoft usado pelo destinatário.

## Para que os dados serão usados

Usaremos a inscrição exclusivamente para enviar uma notificação quando um novo artigo em português for efetivamente publicado no portfólio. Não haverá conta, publicidade, segmentação, venda de dados, perfil comportamental ou notificação sobre conteúdo em inglês ou espanhol.

## Quais dados serão tratados

- endpoint de entrega criado pelo navegador;
- material criptográfico `p256dh` e `auth` necessário para proteger a mensagem;
- idioma `pt-BR`;
- finalidade, versão e instante UTC do consentimento;
- expiração absoluta e estado da inscrição;
- identificadores pseudonimizados, hashes das credenciais de cancelamento e metadados estritamente necessários à segurança, entrega, deduplicação e exclusão;
- logs operacionais sanitizados, que não devem conter endpoint, chaves ou credenciais.

Não solicitaremos nome, e-mail, telefone ou localização para a inscrição. Provedores e infraestrutura podem observar IP, URL, data/hora, user agent e telemetria técnica mesmo quando a aplicação não os persiste intencionalmente. Pedidos enviados pelo canal de contato conterão os dados que o titular decidir fornecer.

## Base legal proposta

A base legal proposta para a inscrição e o envio é o consentimento do titular, nos termos dos arts. 7º, I, e 8º da LGPD. A permissão nativa do navegador é um controle técnico adicional e não substitui o consentimento informado apresentado pelo portfólio. A adequação dessa base e de bases eventualmente aplicáveis a segurança, atendimento de direitos e obrigações legais depende de revisão jurídica.

## Fornecedores e compartilhamentos

- GitHub Pages hospeda o site estático e pode manter registros técnicos das visitas;
- Microsoft Azure hospeda Functions, Cosmos DB, Storage, Key Vault e Log Analytics;
- o navegador escolhe o serviço de entrega, que pode ser Google/Firebase Cloud Messaging, Mozilla Push, Apple Web Push/APNs ou Microsoft WNS;
- GitHub Actions participa da publicação e, futuramente, do enqueue privado apenas com ID de campanha, sem dados de inscritos;
- Microsoft Outlook recebe pedidos encaminhados ao canal de contato.

Os papéis contratuais, subprocessadores e compartilhamentos de cada fornecedor ainda serão validados. O [inventário interno](processing-inventory.md) registra as evidências e lacunas atuais.

## Transferências internacionais

Cosmos DB, Function, Storage, Key Vault e Log Analytics foram declarados em `brazilsouth`, mas isso não garante que todo tratamento permaneça no Brasil. GitHub, plano de controle e suporte da Azure, fornecedores, subprocessadores e serviços Web Push podem tratar dados no exterior. A identificação de países, papéis e mecanismo jurídico conforme os arts. 33 a 36 da LGPD e a Resolução CD/ANPD nº 19/2024 é bloqueio de produção.

O consentimento para receber artigos não será tratado como autorização genérica para qualquer transferência internacional.

## Retenção e exclusão

A inscrição expira 365 dias depois do consentimento. Atualizações operacionais não prorrogam esse prazo; renovar exige novo consentimento explícito. Inscrições revogadas ou expiradas deixam de ser elegíveis para novos envios. Respostas `404` ou `410` do serviço de entrega acionam remoção segura.

Logs operacionais sob controle do projeto terão retenção de 30 dias. Exclusão da base ativa não significa remoção instantânea de backups, logs gerenciados ou filas do fornecedor. A configuração atual do Cosmos DB usa backups periódicos a cada quatro horas, retidos por oito horas. Prazos de prova de consentimento, pedidos de titulares, incidentes e eventual conservação legal serão informados após decisão jurídica, sem uso incompatível com a finalidade original.

## Cancelamento e direitos

O titular poderá cancelar pelo site usando uma capacidade mantida no dispositivo ou uma credencial de recuperação entregue na inscrição. A revogação efetivada impede novas entregas iniciadas pelo projeto, mas não permite recolher mensagem já entregue ou em trânsito.

Pelo canal `rodrigodotnet@outlook.com`, o titular poderá pedir confirmação, acesso, correção quando aplicável, informação sobre compartilhamentos, revogação, bloqueio, anonimização ou eliminação e exercer os demais direitos aplicáveis. A verificação será proporcional aos riscos e usará o mínimo de dados. Respostas genéricas não confirmarão a terceiros se uma inscrição existe.

A perda do dispositivo e das duas credenciais não elimina direitos, mas pode impedir a identificação segura de um registro específico sem evidência adicional. O caso será tratado manualmente, sem exigir cadastro; se não houver prova proporcional suficiente, o controlador explicará a limitação e a expiração automática continuará aplicável.

O titular também pode peticionar perante a ANPD. Esta versão candidata deve ser confirmada ou ajustada pela revisão jurídica antes da publicação efetiva e da coleta de qualquer inscrição.
