# Etapa 5 — Assistente previsível e vocabulário ampliado

Implementação local. Mantém o toque no ícone, reconhecimento do navegador e resposta falada, sem painel novo, escuta permanente ou serviço pago adicional.

## Alterações

- Ativar e desativar rolagem inteligente, automática e afinador respeitam o estado atual. Repetir ativação não reinicia progresso nem desliga o recurso.
- Abrir, iniciar, parar e ajustar metrônomo dentro da música usam o metrônomo integrado. O geral já aberto não é reaberto/reiniciado por comandos de início repetidos.
- Verifica estado real após iniciar áudio/microfone. Falhas retornam resposta de erro; execução simultânea e resultados duplicados da mesma captura são contidos.
- Números por extenso para BPM, capotraste, escala e compasso. BPM permitido de 30 a 240; casas de zero a 12; compassos 2/4, 3/4, 4/4 e 6/8.
- Músicas homônimas não são escolhidas arbitrariamente. Novo comando pode especificar título seguido de “de” e artista. Texto desconhecido contendo um título não abre a música por acidente.
- Sinônimos incluem habilitar, retomar, continuar, desabilitar, interromper, silenciar, cessar, rolagem por áudio/som, retirar capotraste, próximo louvor, canção anterior e inteligência artificial. Corrige formas imperativas e plural de cifras; números falados não transformam os nomes musicais.
- “Desativar modo palco” encerra, em vez de abrir o palco. Aumentar/baixar tom aceita artigo opcional.
- Os testes do assistente agora fazem parte de `npm test`. Teste separado de interface usa os controles reais e não envia dados a produção.

## Exemplos

- “Ative a rolagem inteligente” / “Interrompa a rolagem inteligente”.
- “Continuar rolagem automática” / “Desabilite a rolagem automática”.
- “Metrônomo em cento e vinte e cinco” / “Compasso seis por oito”.
- “Capotraste na casa três” / “Sem capotraste”.
- “Mudar cor das cifras para azul” / “Mude o idioma para inglês”.
- “Abrir título da música de nome do artista”.
- “Abrir Gerar com IA” ou “Gerar com IA” abre a ferramenta; não gera nem salva automaticamente.

## Limites

Não é um agente conversacional irrestrito. Comandos permanecem majoritariamente em português. Desambiguação requer novo toque e comando; não foi criada conversa contínua. Reconhecimento acústico depende do navegador e pode depender de conexão. Testes verificam transcrições/comandos e execução, não garantem acerto de transcrição em microfones reais.

Ações destrutivas preservam as confirmações existentes na interface. Não há confirmação destrutiva por voz nem bypass de permissões. Não houve push ou deploy.
