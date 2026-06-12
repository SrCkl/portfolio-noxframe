COMO APLICAR NO SEU REPO ATUAL

1) Copie estes arquivos para a raiz do projeto portfolio-noxframe:
- package.json
- server.js
- .env.example

Pode substituir os arquivos existentes.

2) No terminal do VS Code, dentro da pasta do projeto:

npm install

3) Crie seu .env local:

copy .env.example .env
notepad .env

Preencha com seus dados do Cloudinary e senha ADM.

4) Teste local:

npm start

Abra:
http://localhost:3000
http://localhost:3000/adm

5) Envie para o GitHub:

git add .
git commit -m "adiciona cloudinary no adm"
git push

6) Na Vercel, adicione as mesmas variáveis de ambiente:

ADMIN_PASSWORD
SESSION_SECRET
NODE_ENV=production
CLOUDINARY_CLOUD_NAME
CLOUDINARY_API_KEY
CLOUDINARY_API_SECRET
CLOUDINARY_FOLDER=noxframe-portfolio

7) Faça redeploy na Vercel.
