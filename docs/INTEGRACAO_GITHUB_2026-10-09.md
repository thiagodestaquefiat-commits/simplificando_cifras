# Integração local com a main — 09/10/2026

## Referências

- Main consultada e integrada: `e0aac74` (PR #91).
- Base local anterior: `7b50c48`.
- Melhorias de áudio preservadas antes da mesclagem: `e2b4d10`.
- Branch de trabalho: `codex/integracao-github-2026-10-02`.
- Esta operação não faz push nem deploy e não executa migrações no banco de produção.

## Novidades recebidas da main

Interface atualizada da playlist, conta e eventos; leitura paginada; ampliação do texto por gesto; tema claro e formulários; busca e revisão de cifras; melhorias do YouTube; preparação e revisão de músicas, inteligência contextual e confirmações de ações; compartilhamento do evento; ajustes no logout e na persistência local.

## Decisões e correções da integração

- Resolvidos os conflitos de `index.html`, `package.json`, service worker e teste PWA.
- Mantidas as suítes locais e adicionados os testes dos recursos contextuais e de compartilhamento.
- Preservado o reconhecimento de acordes com janela de áudio curta e confirmação consistente de 120 ms, rejeitando picos isolados e a terça incompatível.
- Recuperados os controles, estilos, pontos de leitura e repetições da rolagem inteligente. A sequência usa somente a página visível e acompanha alterações de tom/capotraste.
- Recuperadas a leitura, edição e prévia de tablaturas. Elas ficam numa página adicional apenas quando compatíveis com o instrumento, sem aparecer em Letra e cifra. Preservadas a detecção de afinações alternativas e as identificações Solo/Riff.
- Mantido o salvamento explícito dos ajustes da música: o botão aparece apenas quando o estado difere da referência e desaparece ao desfazer ou salvar. A proposta de autosave da main não substitui esse fluxo local já definido.
- Restauradas as cópias independentes dos eventos, inclusive nos novos caminhos de adicionar uma música. Ajustes de tom, capo, BPM, vídeo, cifra completa, editor e IA permanecem no contexto do evento.
- Preservadas as visualizações do novo editor do evento, sem confundir a opção Cifras com a página Tablaturas.
- Mantidas as regras de catálogo comunitário: contribuição inicial elegível via busca/arquivo; texto manual e edições pessoais não atualizam o catálogo.
- Perfil fecha o drawer anterior e mantém o assistente oculto. Corrigido o encaixe dos controles em telas pequenas.
- Chat aberto marca as mensagens locais como lidas mesmo se a atualização remota falhar.
- Cache offline unificado: `simplificando-cifras-v347-github-integrado`, com os recursos efetivamente carregados pela interface.

## Validação

- 59 suítes no comando principal de testes frontend.
- 397 testes backend.
- Testes de navegador: confirmação de acordes em 120 ms; repetições 4x/2x; tablaturas, Drop C e seleção de instrumentos offline; isolamento da música do evento; assistente contextual e perfil; cache PWA e backup; inclusão de música no evento; controles responsivos, ampliação e rolagem; edição oficial, permissões e chat em duas larguras.
- As verificações de navegador usam dados fictícios e respostas de API simuladas, sem escrever em contas reais.
- Reconhecimento de voz/microfone em equipamento real, login Google real e serviços externos não são certificados pelos testes simulados; dependem do navegador, permissões e ambiente do usuário.

## Execução local

`npm run dev` disponibiliza a aplicação na porta 4173 e o motor local de intenções Python na porta 5010. Algumas APIs externas continuam usando o servidor configurado pelo projeto; executar a interface local não equivale a migrar ou publicar o backend.

A integração recupera comportamentos locais e adapta a interface já aprovada da main; não introduz um novo redesenho independente.
