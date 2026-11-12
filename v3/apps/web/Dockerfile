# v3-Web (statisch, nginx). Bis zum Web-Build (M7, nach Gate G1) nur eine Platzhalter-Seite; /api geht an den Server.
FROM nginx:1.27-alpine
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY apps/web/static/ /usr/share/nginx/html/
