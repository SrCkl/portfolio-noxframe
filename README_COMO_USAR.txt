NOXFRAME DESIGNS — PORTFÓLIO COM PAINEL ADM

Essa versão tem:
- Site público normal para visitantes.
- Botão discreto ADM no rodapé.
- Login protegido por senha no servidor.
- Cadastro de nova arte com imagem, título, tipo, categoria e formato.
- Edição de título, tipo, categoria, formato e imagem.
- Remoção de artes.
- Botões para subir/descer a ordem das artes no portfólio.
- Publicação automática no site após cadastrar pelo painel.

IMPORTANTE SOBRE A SENHA
A senha NÃO fica no HTML, CSS ou JS do navegador.
Ela fica apenas no arquivo .env, que roda no servidor.
Por isso, não aparece no "inspecionar" do navegador.

COMO RODAR NO PC
1. Instale o Node.js.
2. Abra a pasta do projeto no terminal.
3. Rode:
   npm install

4. Copie o arquivo .env.example e renomeie a cópia para:
   .env

5. Abra o arquivo .env e coloque sua senha:
   ADMIN_PASSWORD=sua_senha_aqui
   SESSION_SECRET=uma_frase_grande_e_aleatoria_aqui

6. Rode:
   npm start

7. Abra no navegador:
   http://localhost:3000

8. Painel ADM:
   http://localhost:3000/adm

COMO ADICIONAR UMA ARTE
1. Entre no /adm.
2. Digite a senha.
3. Coloque o título da arte.
4. Escolha o tipo: thumbnail, cartaz, folder, flyer, banner etc.
5. Escolha a categoria do site.
6. Escolha o formato visual:
   - Quadrado / normal
   - Horizontal / thumbnail
   - Vertical / post
7. Envie a imagem.
8. Clique em Publicar arte.

A arte aparecerá automaticamente no portfólio público.

SOBRE PUBLICAR ONLINE
Essa versão usa backend Node.js, porque senha segura e upload de imagem não devem ficar só em HTML/CSS/JS.

Se hospedar em um servidor Node com disco persistente, funciona bem.
Exemplos: VPS, Railway/Render com disco persistente ou servidor próprio.

Atenção: se colocar só como site estático na Vercel, o painel ADM com upload não funciona direito, porque arquivos enviados e JSON local não ficam salvos de forma permanente em serverless.
Para usar na Vercel com painel real, o ideal é ligar em um banco/storage externo, como Supabase, Cloudinary, Firebase ou outro serviço.
