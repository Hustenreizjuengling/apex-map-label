--------------------------------------------------------------------------------
-- Map Label Demo  -  APEXLang validate & import
--------------------------------------------------------------------------------
-- SQLcl-Kommandos, um die Demo-App zu pruefen und in den APEX-Workspace zu
-- importieren. Auszufuehren in einer SQLcl-Session, die mit dem Ziel-Schema des
-- gewuenschten APEX-Workspace verbunden ist (z.B. SQLcl-Terminal der Oracle SQL
-- Developer VS Code Extension).
--
-- WICHTIG vorab:
--   * Der Workspace wird aus der SQLcl-Verbindung abgeleitet (Schema -> Workspace);
--     deployments/default.json enthaelt nur app.id (Default 200). Diese ID nur
--     aendern, falls im Workspace bereits eine App mit der ID existiert (Import
--     ueberschreibt diese!).
--   * Den Pfad unten durch den absoluten Pfad zum Ordner "demo/apex-app"
--     (enthaelt application.apx + .apex/apexlang.json) ersetzen.
--
-- Tipp: Eine lokale Kopie mit echten Pfaden (demo/deploy.local.sql) wird nicht
--       eingecheckt; diese generische Vorlage schon.
--------------------------------------------------------------------------------

-- 1) NUR PRUEFEN (veraendert nichts im Workspace):
apex validate -input <ABSOLUTER_PFAD_ZUM_REPO>/demo/apex-app

-- 2) IMPORTIEREN (gleiche SQLcl-Session, erst nach fehlerfreiem validate) -------
--    Zum Importieren die naechste Zeile entkommentieren:
-- apex import -input <ABSOLUTER_PFAD_ZUM_REPO>/demo/apex-app

--    Falls SQLcl "multiple workspaces" meldet, die Workspace-ID ergaenzen:
-- apex import -input <ABSOLUTER_PFAD_ZUM_REPO>/demo/apex-app -workspaceid <WORKSPACE_ID>
