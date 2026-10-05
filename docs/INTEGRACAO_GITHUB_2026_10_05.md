# Integração local — 05/10/2026

- Main incorporada: `cf66b80` (PR #83), obtida do GitHub neste trabalho.
- Checkpoint local recuperável: `5a7efa0`.
- Branch local: `codex/integracao-github-2026-10-02`.
- Sem push, deploy ou alteração de dados no Supabase.

## Integração

Incorporados a ordem Letra + Cifras / Resumo Harmônico e o aviso detalhado de limite de busca na web (quantidade, liberação e alternativas). A preferência de visualização já salva para uma música continua respeitada.

Preservados backup automático aditivo sem eventos, isolamento de contas, eventos offline, assistente contextual e exclusão nos menus da conta, detecção espectral de acordes e salvamento explícito de ajustes pessoais. A mescla não muda as regras de publicação de músicas no catálogo.

Conflitos no cache e em dois testes foram conciliados: cache `v187-github-unificado`, cliente de IA v15, versões atuais dos módulos locais preservadas. Teste de letra/cifra ajustado para passar pela tela de entrada antes de interagir.

## Validação

Suíte principal npm aprovada; backend: 324 testes aprovados. Testes isolados de cliente de IA, completar cifra, letra/cifra em três tamanhos de tela, assistente contextual e backup automático aprovados. Testes de voz e IA usam simulações, sem comprovar microfone real nem consumir geração em produção.

O preview utiliza a API publicada conforme configuração existente. As novidades do backend foram testadas localmente, mas dependem de futuro deploy para aparecer no serviço oficial.
