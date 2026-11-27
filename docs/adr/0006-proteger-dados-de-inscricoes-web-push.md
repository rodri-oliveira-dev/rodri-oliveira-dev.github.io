# Limitar o tratamento de dados às inscrições Web Push

## Status

Proposed

## Context

Uma inscrição Web Push contém um endpoint de entrega e material criptográfico associado ao navegador. Esses valores não identificam necessariamente o visitante pelo nome, mas podem funcionar como identificadores de um dispositivo ou instalação e, portanto, serão tratados como dados pessoais para fins de projeto.

A primeira versão terá uma única finalidade: avisar sobre artigos novos em português. Não haverá conta, newsletter por e-mail, segmentação comportamental ou publicidade. O requisito de armazenamento em São Paulo reduz a exposição operacional, mas não elimina possíveis transferências internacionais por provedores de push ou componentes do serviço.

Em 26/11/2026, o responsável pelo projeto aprovou expressamente o conjunto de decisões de privacidade documentado na issue #151: finalidade exclusiva de notificar novos artigos PT-BR; consentimento explícito, livre, informado e versionado; versão inicial `1.0.0`; validade de 365 dias sem renovação implícita; logs operacionais por 30 dias; cancelamento por capacidades criptográficas e credencial de recuperação; minimização; uso do canal de contato já publicado; mapeamento de transferências internacionais; e revisão jurídica obrigatória do aviso antes da produção. Esse aceite autoriza detalhar e implementar controles de forma progressiva, mas não autoriza produção, inscrições reais, envio, mudança de infraestrutura ou a aceitação automática desta ADR.

## Decision

Coletar somente endpoint, chaves `p256dh` e `auth`, idioma PT-BR, finalidade, instante e versão do texto de consentimento, expiração absoluta e metadados estritamente necessários à operação, prova do opt-in e exclusão. Não solicitar nome, e-mail, telefone nem localização. Não persistir IP ou identificadores de navegação para perfil; logs técnicos deverão omitir endpoints, chaves e capacidades. Hashes derivados de endpoint ou capacidade continuam sendo identificadores pseudonimizados ou material de autenticação, não dados anônimos.

A inscrição dependerá de ação voluntária e informação clara antes da permissão nativa do navegador. Adotaremos consentimento como base legal proposta, sujeito à avaliação prévia documentada das obrigações aplicáveis ao piloto e à revisão jurídica integral das pendências relevantes antes da abertura pública, conforme a ADR 0022. A evidência associará finalidade estável, versão `1.0.0`, instante UTC aceito pelo servidor e geração da inscrição. O texto versionado será preservado no repositório.

Cada consentimento valerá por 365 dias. A inscrição terá `expiresAtUtc` absoluto, calculado a partir do consentimento e imutável por atualizações operacionais. Renovação exige nova manifestação explícita, nova evidência e nova geração; nenhuma atualização de endpoint, chave, ETag, status ou tentativa de entrega renova a validade. O TTL do Cosmos DB poderá auxiliar a exclusão física, mas não será a fonte de verdade da validade, pois seu contador usa a última modificação do item. Inscrições expiradas ou revogadas não poderão ser reivindicadas para envio.

O cancelamento automático usará capacidades criptograficamente aleatórias, de alta entropia e armazenadas no servidor somente como hash com separação de domínio. Uma capacidade operacional ficará no dispositivo e uma credencial de recuperação independente poderá ser guardada pelo titular. Nenhuma delas aparecerá em URL, log, telemetria ou erro. A API responderá de forma idempotente e não revelará a existência de inscrição. A perda das duas credenciais não elimina direitos: o canal público atenderá o caso com verificação proporcional e sem cadastro ou coleta excessiva.

Revogação efetivada impede novas reivindicações de envio. Uma entrega já submetida ao provedor ou em trânsito não pode ser recuperada. Respostas `404` e `410` do provedor acionam remoção segura, protegida contra apagar uma geração renovada concorrente. Logs operacionais sob controle do projeto terão retenção máxima de 30 dias e serão sanitizados; retenções impostas por tabelas de plataforma, backups, fornecedores ou obrigação legal devem ser inventariadas, justificadas e validadas antes da produção.

Restauração de backup não reativa inscrições. Cada geração recebe uma `recoveryEpoch` configurada fora do container; listagem e releitura anterior ao envio exigem a epoch corrente. Antes de conectar uma conta restaurada, a configuração deve ser rotacionada com os kill switches ativos. Como o backup periódico não conserva um ledger externo de revogações posteriores, inscrições recuperadas serão descartadas e exigirão novo consentimento, nova geração e novas capacidades. Essa perda deliberada de disponibilidade evita serviço/custo adicional e é preferível a presumir validade que não pode ser comprovada.

A API aplicará limites de corpo, validação estrita, timeout, concorrência local e rate limiting distribuído aproximado no container Cosmos existente, com contadores temporários shardados e falha fechada. A escolha evita um serviço adicional e não trata memória de uma instância Flex como garantia global. Tentativas negadas ainda podem consumir RU e o limite não identifica pessoas por IP; limites de escala, kill switches e monitoramento de custo continuam necessários. CORS ficará restrito à origem do portfólio, mas não será tratado como autenticação ou autorização.

Persistir as inscrições em serviço gerenciado na região `brazilsouth` (São Paulo), restringir acesso por identidade e regionalizar logs e segredos que possam conter dados da operação. Mapear os fluxos com provedores de push e avaliar transferência internacional nos termos da LGPD e da regulamentação da ANPD. Disponibilizar canal para exercício de direitos quando o navegador original não estiver acessível.

Os requisitos operacionais, o aviso em minuta, o inventário e a rastreabilidade ficam centralizados em [`docs/privacy/web-push/`](../privacy/web-push/README.md). A ADR 0009 continua sendo a referência de plataforma Azure e a ADR 0012, a referência de publicação coordenada. Nenhuma delas substitui a avaliação de privacidade desta decisão.

## Consequences

A aplicação poderá operar sem cadastro, reduzindo coleta, fricção e impacto de eventual incidente. Consentimento e cancelamento poderão ser rastreados sem recorrer a dados pessoais adicionais.

Continuarão existindo responsabilidades de segurança, retenção, atendimento a titulares e avaliação de fornecedores. A localização do banco de dados não garante que todo o tratamento permaneça no Brasil. Antes da entrada em produção, será necessário concluir a implementação e os testes das issues dependentes, revisar juridicamente o aviso e as transferências, validar contratos e papéis dos fornecedores e obter os gates humanos posteriores. A ADR permanece `Proposed`; o aceite das decisões de #151 não equivale a parecer jurídico nem ao go-live.

### Sequenciamento de entrega

A [ADR 0022](0022-consolidar-privacidade-web-push-antes-do-piloto.md) complementa esta decisão: #155 e #156 precedem #166; a avaliação proporcional e documentada dos fluxos efetivamente usados precede o piloto individual, e a revisão jurídica integral das pendências relevantes precede #167. Nenhuma obrigação aplicável ao piloto é adiada. Os controles técnicos, gates e status `Proposed` permanecem inalterados.
