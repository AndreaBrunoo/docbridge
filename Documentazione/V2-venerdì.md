# Requisiti

## Repo di approvvigionamento
i documenti che non sono della repo di Uno Energy (quindi da provider esterni), possonono arrivare da più repo e non solo da Postel.
dunque, all'entrata dell'aplicativo bisogna poter scegliere in quale repo si vuole lavorare. ovviamente ci sarà bisogno di credenziali univoche per poter lavorare nella repo specifica, e non un account per tutte.

## Ruoli
per l'utilizzo dell'applicativo, all'autenticazione, viene assegnato un ruolo: 
- Visualizzatore: è in grado di visualizzare tutti i documenti in area consultazione ma non di più (da confermare)
- Tecnico: è in grado di compiere il matching dei documenti nell'area di staging 
- DPO: è in grado di controllare chi è stato ad effettuare il determinato match dei documenti in colsultazione ed ha un pannello di controllo degli utenti. 

## Visualizzazione per Aree

### Area STAGING
L'area Staging è dedicata a quei documenti che non sono ancora Matchati tra di loro(un are per i documenti single). i doc che arrivano da: 

- Uno Energy:  sono I doc che non hanno un match tra u consultabili
- Postel e altri: sono I doc senza o con firma PD External id non valida e senza un match tra i consultabili.

### Area CONSULTAZIONE
L'area consultazione è dedicata a quei documenti che sono stati già matchati automaticmente o manualmente dai tecnici. 
anche se il documento ha un PDExternalId, questo andra in area Staging se non è stato già matchato.

## Ricerca Avanzata
la ricerca avanzate deve esere per i seguenti campi del documento: 

- Codice_fiscale (vedere come si chiama il campo reale)
- Partita_iva (vedere come si chiama il campo reale)
- PDExternalId
- POD
- PDR
- Data

## Modifiche UI/UX
- cambiare postel Zip in Postel WS con una icona : 📧
- inserire un pallino rosso per gli aggiornamenti nell'area Staging (solo per Tecnici)
- cambiare il tema scuro con un colore di fondo Blù scuro. 
- Aggiungere l'icona `Uno Energy` in alto a sinistra. (al posto di DocBridge)
