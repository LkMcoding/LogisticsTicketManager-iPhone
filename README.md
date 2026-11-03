# Logistics Ticket Manager — iPhone (Beta 0.1)

Versione PWA **separata** dal progetto Windows/Electron. Nessun backend, account o database sul server.

## Cosa funziona
- Aggiunta/modifica/completamento dei ticket
- Colonne personalizzabili, spostamento ticket tra colonne e scroll interno
- Riconoscimento corriere: `IT...` = AMAZON, `166...` = HR
- Etichette e scadenze (anche 10 giorni lavorativi, festività italiane nazionali e Pasquetta)
- Calendario eventi/scadenze, ricerca e filtri
- Commenti e archivio
- Salvataggio locale con IndexedDB
- Backup JSON manuale e import con conferma (formato iPhone `LTM_PORTABLE` v1)
- Installazione da Safari e uso offline dopo il primo caricamento

## NON ancora incluso
- Allegati
- Draft Outlook / allegati email
- Importazione diretta dei backup Windows (`backup.json` + `database/logistics.db` + `allegati/`)
- Esportazione Excel e CSV
- Sincronizzazione tra PC e iPhone

**Nota compatibilità:** il backup JSON è un formato di scambio *previsto* per entrambe le piattaforme. Allo stato attuale è importabile da questa beta iPhone; per Windows serve ancora un adattatore dedicato e testato. Non importare il backup Windows direttamente nella beta.

## Pubblicazione GitHub Pages (senza Node/npm)

1. Crea un repository **nuovo**, ad esempio `LogisticsTicketManager-iPhone`.
2. Carica **il contenuto** di questa cartella nella radice del repository (non caricare uno ZIP, né il progetto Windows).
3. Vai in **Settings → Pages**.
4. Scegli **Deploy from a branch**, branch `main`, cartella `/(root)`, **Save**.
5. Usa l'URL che comparirà nella sezione Pages, aperto con Safari sull'iPhone.
6. Safari → Condividi → **Aggiungi alla schermata Home** → **Apri come app web** → Aggiungi.
7. Apri l'icona della nuova app; crea un ticket di test, chiudi e riapri, verifica la persistenza.
8. Esporta subito un backup JSON di prova e conservalo in File/iCloud Drive (il backup è separato dai dati salvati nell'app).

## Sicurezza e privacy

- GitHub Pages pubblica soltanto codice, HTML, CSS, JS e icone, non i ticket né le email inserite nell'app.
- Non caricare database reali, screenshot dei ticket, backup o allegati nel repository GitHub.
- I dati non sono criptati con PIN; chiunque abbia accesso al dispositivo sbloccato potrebbe consultarli.
- Safari/iOS può eliminare dati locali in certe condizioni: effettua backup manuali frequenti.
- Dopo aver aggiunto la PWA alla Home, **utilizza sempre la stessa icona**; Safari e l'app Home possono avere archivi separati.
- GitHub Pages è un sito pubblico: conoscerne il link non consente di vedere i tuoi dati locali, ma rende pubblico il codice dell'app.

## Supporto Windows

Questa beta usa solo API Web. **Non** sovrascrivere `LogisticsTicketManager/frontend`, `App.jsx`, `electron/` o il database Windows.

## Evoluzione del progetto

1. Beta 0.1: PWA locale funzionante, bacheca, calendario e JSON.
2. Verifica iPhone: installazione, offline, backup/ripristino, usabilità touch.
3. Bridge Windows v1.0.2: export/import controllati del formato `LTM_PORTABLE` e test roundtrip con dati di prova.
4. Allegati e rafforzamento UI mobile, export CSV/Excel e gestione errori più avanzata.
