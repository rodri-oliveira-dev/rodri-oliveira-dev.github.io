# Limitar o tratamento de dados às inscrições Web Push

## Status

Proposed

## Context

Uma inscrição Web Push contém um endpoint de entrega e material criptográfico associado ao navegador. Esses valores não identificam necessariamente o visitante pelo nome, mas podem funcionar como identificadores de um dispositivo ou instalação e, portanto, serão tratados como dados pessoais para fins de projeto.

A primeira versão terá uma única finalidade: avisar sobre artigos novos em português. Não haverá conta, newsletter por e-mail, segmentação comportamental ou publicidade. O requisito de armazenamento em São Paulo reduz a exposição operacional, mas não elimina possíveis transferências internacionais por provedores de push ou componentes do serviço.

## Decision

Coletar somente endpoint, chaves `p256dh` e `auth`, idioma PT-BR, instante e versão do texto de consentimento e metadados estritamente necessários à operação e à exclusão. Não solicitar nome, e-mail, telefone nem localização. Não persistir IP ou identificadores de navegação para fins de perfil; logs técnicos deverão omitir endpoints e chaves completos.

A inscrição dependerá de ação voluntária e informação clara sobre finalidade, fornecedor e cancelamento. Adotaremos consentimento como base legal proposta, sujeito a revisão do aviso de privacidade e do enquadramento jurídico antes da ativação. O visitante poderá cancelar pelo próprio site; a API deverá verificar que a solicitação tem controle legítimo sobre a inscrição antes de excluí-la. Também serão removidos endpoints rejeitados permanentemente pelo serviço de push e inscrições expiradas conforme política de retenção a ser definida e documentada.

Persistir as inscrições no Firestore em `southamerica-east1`, restringir IAM por identidade e regionalizar logs e segredos que possam conter dados da operação. Mapear os fluxos com provedores de push e avaliar transferência internacional nos termos da LGPD e da regulamentação da ANPD. Disponibilizar canal para exercício de direitos quando o navegador original não estiver acessível.

## Consequences

A aplicação poderá operar sem cadastro, reduzindo coleta, fricção e impacto de eventual incidente. Consentimento e cancelamento poderão ser rastreados sem recorrer a dados pessoais adicionais.

Continuarão existindo responsabilidades de segurança, retenção, atendimento a titulares e avaliação de fornecedores. A localização do Firestore não garante que todo o tratamento permaneça no Brasil. Antes da entrada em produção, será necessário aprovar o aviso de privacidade, o prazo de retenção e o fluxo de exclusão; a ADR não equivale a parecer jurídico.
