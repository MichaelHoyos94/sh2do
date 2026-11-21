#!/bin/sh
# Solo corre al crear el volumen por primera vez (down.ps1 -Volumes para reiniciar).
# Crea la BD de pruebas y da permisos al usuario de la app (incluida la BD sombra de Prisma Migrate).
mysql -uroot -p"$MYSQL_ROOT_PASSWORD" <<SQL
CREATE DATABASE IF NOT EXISTS sh2do_test;
GRANT ALL PRIVILEGES ON \`sh2do\_%\`.* TO '$MYSQL_USER'@'%';
GRANT ALL PRIVILEGES ON \`sh2do\`.* TO '$MYSQL_USER'@'%';
GRANT ALL PRIVILEGES ON \`prisma\_migrate\_shadow\_db\_%\`.* TO '$MYSQL_USER'@'%';
SQL
