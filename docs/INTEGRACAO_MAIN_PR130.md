# Preparação da PR127 para integração

## Escopo

Integração de `origin/main` (`fd734d4`) na branch de trabalho, preservando a interface aprovada. Importação seletiva da PR130 (`92890ff`) sem substituir suas telas, estilos ou assets. A main e a produção não foram alteradas.

### Melhorias técnicas importadas

- Navegação com fallback ao shell offline após três segundos de rede lenta, mantendo atualização em segundo plano.
- Consulta autenticada da versão do evento antes de baixar seu conteúdo completo; fallback para servidores antigos.
- Redução das escritas de atividade do token para intervalos de dez minutos.
- Carregamento adiado do assistente, mantendo acionamento imediato sob demanda e arquivos disponíveis no cache.
- Agrupamento de atualizações do observador do assistente.
- Recuperação de playlists compartilhadas após login ou entrada como visitante; validade de um dia.
- Preservação da seleção de API nos links compartilhados do preview.
- Exibição provisória das playlists locais apenas quando a sessão salva corresponde à conta lembrada. Configuração do projeto tem precedência; armazenamento com várias sessões desconhecidas não é usado.
- Reconhecimento de acordes entre colchetes.
- Atualização do service worker sem recarregar imediatamente durante o uso.

### Exclusões e decisões

- Não foram importados CSS, posicionamentos, medição de barras fixas ou alterações de layout da PR130.
- A otimização específica do cabeçalho de vídeo da PR130 não se aplica à estrutura atual e não foi copiada.
- QR e seus fluxos foram preservados.
- Módulos frontend de mapa e Spotify foram removidos por autorização explícita posterior. O endereço textual e os dados históricos permanecem. Endpoints de localização do backend permanecem para compatibilidade; o frontend não os carrega.
- Removida a divisória abaixo de “ACORDES”, por solicitação explícita, sem alterar diagramas ou espaçamento.

## Resolução de conflitos

Preservados os fluxos atuais de login, edição de playlist, gravação com envio explícito e assinatura visual. Integradas as APIs de autenticação e exclusão de conta, recuperação de rede, recebimento de playlists e robustez de áudio da main. Corrigidas exportações de funções inexistentes e restaurado explicitamente o estado do botão de reprodução ao perder foco.

## Validação

- Frontend: `npm test`, 74 suítes aprovadas.
- Backend: 578 testes aprovados, banco de teste isolado.
- Testes técnicos da importação: sete suítes aprovadas.
- Chrome local: Busca, login, login mobile, bloqueio de rolagem do evento, cabeçalho compacto, rodapé e capas de playlists aprovados.
- Áudio com Flask real e microfone sintético: gravação, transcodificação, reprodução, cancelamento, preservação após falha, retry e saída aprovados.
- Controles de áudio isolados: envio explícito, pausa, retomada, descarte e retry aprovados.
- Sintaxe dos scripts inline e caminhos locais do manifesto offline verificados.

Os resultados finais da suíte geral e dos checks remotos devem ser conferidos antes do merge. Chrome com viewport mobile não substitui teste manual em Safari/iPhone.

## Ordem de publicação

Publicar o backend antes do frontend para disponibilizar a consulta de versão. Enquanto o endpoint não existir, o cliente mantém o fallback de consulta completa. Validar o Deploy Preview da PR127, incluindo login no celular e atualização do PWA instalado, antes de autorizar merge na main.
