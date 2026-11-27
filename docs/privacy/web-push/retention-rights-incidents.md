# Retenção, cancelamento, direitos e incidentes

## Relógio de validade e exclusão

1. O servidor aceita o consentimento e fixa `consentGrantedAtUtc` e `expiresAtUtc` 365 dias depois.
2. `expiresAtUtc` pertence à geração do consentimento e não muda com entrega, ETag, endpoint, chave, acesso, retry ou outra atualização operacional.
3. Toda consulta de campanha e toda reivindicação imediatamente anterior ao envio exigem `status = active`, `revokedAtUtc = null` e `expiresAtUtc > now`.
4. Expiração impede envio mesmo se a limpeza física atrasar. Renovação cria nova evidência explícita, nova geração e novas capacidades.
5. Revogação muda o estado de forma atômica e impede novas reivindicações assim que efetivada. Mensagem já entregue ou aceita pelo provedor pode continuar em trânsito.
6. Resposta `404` ou `410` remove logicamente e solicita exclusão física da geração correspondente, usando ETag/generation para não apagar reinscrição concorrente.

O container atual usa `defaultTtl = -1`, que habilita TTL por item sem expiração padrão. No Cosmos DB, `ttl` é contado desde `_ts`, e qualquer escrita reinicia o contador. Por isso:

- o TTL não representa os 365 dias nem autoriza seleção para envio;
- `expiresAtUtc` absoluto é a fonte de verdade;
- se TTL for usado, a aplicação deve recalculá-lo como `max(1, expiresAtUtc - now)` em toda escrita, sem alterar `expiresAtUtc`;
- após o vencimento, o item fica inelegível imediatamente, ainda que a purge em segundo plano consuma RU e ocorra depois.

Referência: [TTL do Cosmos DB](https://learn.microsoft.com/azure/cosmos-db/how-to-time-to-live).

## Estados e concorrência

| Corrida | Regra obrigatória |
| --- | --- |
| Envio x revogação | Reivindicar deduplicação e validar estado/expiração de modo atômico na mesma partição. Se a revogação vencer, não enviar. Se o provedor já aceitou, registrar sem prometer recolhimento. |
| Envio x expiração | Revalidar `expiresAtUtc` no instante da reivindicação, não apenas ao listar a página. |
| `404`/`410` x renovação | Exclusão condicionada a ETag e geração observadas no envio; conflito preserva a geração nova. |
| Renovação x revogação | Nunca sobrescrever revogação com upsert genérico. Renovação exige consentimento novo e rota/command dedicado. |
| Dois registros iguais | Um endpoint ativo não pode ter consentimento, chaves ou capacidades substituídos sem prova de posse. Resposta não revela existência. |
| Duas campanhas/retries | A reivindicação persistente por artigo + geração deve ocorrer antes do POST Web Push. O provedor continua sem garantia exactly-once. |

## Capacidade e recuperação

- Gerar no servidor duas credenciais independentes com CSPRNG e pelo menos 256 bits: capacidade do dispositivo e código de recuperação.
- Retornar cada valor em claro uma única vez, somente no corpo HTTPS da resposta de criação; nunca em path, query string, fragment, header referenciável ou mensagem de erro.
- Guardar no servidor apenas hashes separados por finalidade, usando construção resistente a comparação offline e comparação em tempo constante. A escolha final de algoritmo/parâmetros deve ser revisada na #152.
- Manter a capacidade primária em armazenamento local adequado ao contexto do navegador e permitir que o titular exporte/guarde o código de recuperação. Não sincronizar por analytics nem incluir em backup do projeto.
- Rotacionar ambas na renovação/reinscrição e invalidar as anteriores. Limitar tentativas, usar respostas indistinguíveis e auditar apenas resultado agregado.
- Perda do dispositivo, limpeza local ou perda de uma credencial usa a outra. Perda de ambas segue atendimento manual; não autoriza takeover nem confirmação de existência.

No atendimento manual, solicitar primeiro a menor prova já disponível: credencial de recuperação, capacidade ainda acessível ou dados técnicos que o navegador atual consiga apresentar. Não pedir documento, telefone, conta ou novo perfil por padrão. Quando não houver prova suficiente para individualizar com segurança, responder de forma genérica, explicar a limitação, registrar a tentativa de atendimento e informar a expiração automática; a revisão jurídica deve aprovar esse procedimento.

## Camadas de exclusão

| Camada | Semântica |
| --- | --- |
| Lógica | Estado revogado/expirado torna o registro imediatamente inelegível. Deve ser curto e transitório, somente para coordenar concorrência. |
| Física ativa | Delete no Cosmos DB e remoção de qualquer estado de campanha associado, respeitando ETag/generação. |
| Backup | A conta atual usa backup periódico LRS a cada 4 horas, retido 8 horas. Exclusão individual não apaga backup imediatamente; restauração deve reaplicar revogações/expirações antes de qualquer envio. |
| Logs/filas | Sanitizar na origem; reter logs do projeto por 30 dias. Poison queue nunca recebe dados de inscrição. Exceções gerenciadas precisam de inventário. |
| Conservação legal | Somente mediante fundamento documentado, acesso restrito e uso incompatível proibido. Prazos adicionais ainda dependem de decisão jurídica. |

Pendências de prazo: prova de consentimento depois do término, pedidos de titulares, registros de incidentes e dados de fornecedores. Não adotar prazo indefinido por omissão.

Uma restauração pode recuperar o estado anterior a uma revogação. TTL, ETag, geração e releitura desse mesmo snapshot não provam que a inscrição continua válida. O controle implementado associa cada registro a `recoveryEpoch`, configurada fora do container. Antes de conectar dados restaurados, a epoch deve ser rotacionada; registros com epoch anterior ficam inelegíveis na query e no point read. O trade-off adotado para implementação é perder inscrições recuperadas e exigir novo opt-in, pois o backup periódico não mantém um ledger de revogações posterior e um novo serviço não é proporcional ao portfólio. O procedimento completo está no [runbook de recuperação](backup-recovery-runbook.md).

## Direitos dos titulares

Canal: `rodrigodotnet@outlook.com`, existente no portfólio. Procedimento:

1. acusar recebimento sem confirmar a existência de inscrição;
2. classificar o pedido: confirmação/acesso, revogação, eliminação, correção quando aplicável, compartilhamentos ou outro direito do art. 18;
3. verificar titularidade proporcionalmente, priorizando capacidades e prova técnica já possuída;
4. consultar somente o necessário, sem copiar endpoint/chaves para issue, chat, log ou e-mail desnecessário;
5. efetivar revogação imediatamente quando autenticada e coordenar exclusão/retificação com destinatários quando aplicável;
6. responder em linguagem clara, registrar fundamento, data e resultado com minimização;
7. informar limitação, fundamento e meios adicionais quando a providência imediata não for possível.

A [ANPD](https://www.gov.br/anpd/pt-br/assuntos/titular-de-dados/direito-dos-titulares) destaca confirmação, acesso, correção, eliminação e revogação. Prazos específicos e o procedimento final devem ser confirmados pela revisão jurídica. Não se presume enquadramento como agente de pequeno porte.

## Incidentes

1. **Detectar e triar:** registrar instante de ciência, sistemas, categorias e evidências sem reproduzir dados pessoais.
2. **Conter:** manter/acionar kill switch, desabilitar endpoints de inscrição, suspender enqueue, revogar/rotacionar credenciais quando necessário, bloquear acesso e preservar evidência.
3. **Investigar:** determinar causa, período, quantidade/categorias de titulares e dados, fornecedores, transferências, impacto e medidas. Não apagar evidência necessária.
4. **Avaliar risco:** confirmar se houve incidente com dados pessoais e se pode acarretar risco ou dano relevante; não comunicar automaticamente toda vulnerabilidade nem omitir incidente confirmado.
5. **Comunicar:** quando legalmente exigido, controlador comunica ANPD e titulares em até 3 dias úteis da ciência, ressalvada norma específica. Informação incompleta pode ser complementada de forma fundamentada no prazo regulamentar. Mensagem aos titulares deve ser direta e não expor terceiros.
6. **Recuperar:** validar integridade, reprocessar revogações/expirações após restore, testar controles e reativar somente com aprovação apropriada.
7. **Registrar e aprender:** documentar decisão de comunicar ou não, cronologia, medidas e lições. Prazo do registro depende de validação jurídica da Resolução CD/ANPD nº 15/2024.

Referência oficial: [Comunicação de Incidente de Segurança — ANPD](https://www.gov.br/anpd/pt-br/canais_atendimento/agente-de-tratamento/comunicado-de-incidente-de-seguranca-cis).
