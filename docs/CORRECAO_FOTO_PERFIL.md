# Persistência da foto de perfil

## Causas corrigidas

- A foto recortada só existia no cache local e não era enviada à conta.
- O logout removia a cópia local, fazendo reaparecer a imagem do Google.
- `avatarUrl || fallback` confundia remoção explícita (`null`) com ausência de configuração.
- Menu e editor compartilhavam o mesmo ID de elemento de avatar.
- O cache podia usar o ID interno enquanto a autenticação era restaurada por outro identificador.

## Fluxo atual

1. O editor continua recortando a imagem antes de salvar.
2. A cópia local usa o ID estável da conta e registra envio pendente.
3. O perfil básico é atualizado no Auth; a imagem NÃO vai para os metadados/JWT.
4. `PATCH /api/collaboration/me/avatar` guarda a foto da conta autenticada no banco da aplicação.
5. O servidor valida tamanho/tipo/conteúdo com Pillow e reencoda em JPEG de até 256 x 256, removendo metadados.
6. `GET /api/collaboration/me` devolve a foto própria, ou a remoção explícita, com precedência sobre a foto do Google.

Nova tabela: `profile_avatars`, com chave estrangeira para `collaboration_users`. Uma linha nula representa remoção; ausência de linha mantém o comportamento anterior para contas não personalizadas. A inicialização existente (`db.create_all`) cria a tabela sem alterar/apagar as demais.

Logout preserva somente o cache da foto e seu estado de envio por conta; visitante e outras contas não recebem essa imagem. Falha/timeout não é anunciado como sucesso de gravação na nuvem. Mudanças de identidade invalidam atualizações tardias.

## Publicação

Frontend e backend precisam ser publicados juntos para persistência entre aparelhos. O backend que já está em produção não possui a rota nova até o deploy. Até lá, a foto permanece no cache deste aparelho; o app informa quando a atualização da conta está pendente. Não foi feito deploy neste trabalho.

## Testes

- Navegador: upload, recorte, salvar, reabrir, reload, logout/login, remoção, cache com IDs distintos e conta sem cache.
- Auth: envio autenticado, renovação sem recuperar foto do Google, remoção e falha de servidor; imagem fora do JWT.
- Backend: persistência em banco, troca, remoção, isolamento A/B, login Google e rejeição de imagens inválidas.
