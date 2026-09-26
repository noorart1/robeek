@echo off
rem Local MariaDB for testing; see "Local testing first" in CLAUDE.md.
rem Works from PowerShell (scripts\db.cmd), cmd, or a double-click.
"%~dp0..\..\mariadb\bin\mariadbd.exe" --defaults-file="%~dp0..\..\mariadb\data\my.ini" --console
