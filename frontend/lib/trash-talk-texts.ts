// ============================================================
// Trash-talk text pools — add/remove/edit strings freely.
// Each function in trash-talk.ts picks one at random per render.
// ============================================================

// --- Score: overall game score rating (player profile + day stats) ---
export const score = {
  legendary: [
    'über 200? Entweder lügt die App oder du hast heimlich trainiert.',
    'das ist kein Hobby mehr, das ist eine Drohung mit Kugel.',
    'die Pins haben kollektiv die Kündigung eingereicht.',
    'bei dem Score muss man fragen: war das überhaupt legal?',
    'Gratulation, du hast offiziell das Recht auf eine unerträgliche Siegespose.',
    'zweihundert-plus unter Hobbyisten ist wie ein Ferrari auf dem Supermarktparkplatz.',
    'dein Score ist so hoch, die anderen überlegen, ob du noch zur Beerdigung ihrer Motivation eingeladen wirst.',
  ],
  veryStrong: [
    'da darf man ruhig kurz arrogant gucken. Sonnenbrille optional.',
    'das ist kein Score, das ist eine kleine Machtdemonstration.',
    'die Pins haben gerade eine Beschwerde beim Management eingereicht.',
    'das ist das Niveau, ab dem die anderen aufhören zu lachen.',
    'deine Mitspieler googeln jetzt heimlich "wie wird man besser im Bowling".',
    'stark genug, um den Rest des Abends darüber zu reden. Und das wirst du.',
    'bei dem Score sterben Freundschaften. Nicht sofort, aber der Samen ist gesät.',
  ],
  strong: [
    'stabile Nummer — die Bahn kann heute nicht als Ausrede herhalten.',
    'unangenehm solide. Da wird Trash-Talk für die anderen schwer.',
    'nicht perfekt, aber definitiv genug, um selbstzufrieden zu nicken.',
    'der Score sagt: ich weiß ungefähr, was ich tue. Die Betonung liegt auf ungefähr.',
    'damit lässt sich arbeiten. Und angeben. Vor allem angeben.',
    'respektabler Score. Die Mitspieler müssen sich jetzt was einfallen lassen oder einfach traurig sein.',
    'gut genug, um die Hoffnung der anderen langsam und qualvoll zu ersticken.',
  ],
  solid: [
    'nicht glamourös, aber immerhin keine komplette Spurensicherung nötig.',
    'brauchbar. Kein Feuerwerk, aber auch kein Versicherungsfall.',
    'die Würde lebt, wenn auch mit leichten Gebrauchsspuren.',
    'das ist der Bereich, in dem man sagt "war okay" und es sogar stimmt.',
    'weder peinlich noch prahlwürdig. Genau die Mitte, die keiner will.',
    'reicht fürs Protokoll, reicht nicht fürs Poesiealbum.',
    'das sportliche Äquivalent zu "er hat sich bemüht" auf dem Zeugnis.',
  ],
  casual: [
    'da ist noch Luft für weniger Chaos und mehr Absicht.',
    'zweistellig vermieden, aber der Applaus bleibt erstmal im Auto.',
    'man erkennt Bowling. Man erkennt aber auch Baustellen.',
    'das ist die Punktzahl, bei der man sagt "ich hatte Spaß" und meint "redet nicht drüber".',
    'immerhin: aufrecht gestanden, Kugel losgelassen, Pins getroffen. Manche davon.',
    'technisch gesehen ist das ein Score. Emotional gesehen ist das eine Baustelle.',
    'wenn das dein Lebenslauf wäre, würde er im Papierkorb landen. Mit Anlauf.',
  ],
  needsWork: [
    'Spares und Konstanz würden hier mehr helfen als ein Exorzist.',
    'unter 90 ist sportlich gesehen ein Hilferuf mit Kugel.',
    'da wurden mehr Hoffnungen als Pins abgeräumt.',
    'das ist weniger Bowling als betreutes Kugelrollen.',
    'die Rinne hat heute mehr Kontakt mit der Kugel als die Pins.',
    'Tipp: die Pins stehen am Ende der Bahn. Gerne mal in die Richtung werfen.',
    'dein Score hat die gleiche Überlebenschance wie eine Schneeflocke in der Hölle.',
  ],
} as const;

// --- Player-relative score: compares one score to that player's own baseline ---
export const playerRelativeScore = {
  baseline: (average: number) => [
    `dein persönlicher Nullpunkt liegt bei Ø ${average}. Ab hier wird nicht mehr pauschal bewertet, sondern gegen dich selbst verhandelt.`,
    `Ø ${average} ist deine Normalform. Alles darunter ist Beweismaterial, alles darüber darf als Angeberei eingereicht werden.`,
    `das ist deine Hausmarke bei Ø ${average}. Die Leiste nimmt dich ab jetzt persönlich, nicht global.`,
    `dein Durchschnitt ist hier der Maßstab. Praktisch: die Statistik kennt deine Ausreden schon vorher.`,
  ],
  disaster: (score: number, average: number, delta: string) => [
    `${score} bei Ø ${average}? ${delta} Pins unter Normalform. Das war kein Ausrutscher, das war ein Treppensturz.`,
    `${delta} Pins gegen dich selbst verloren. Die Pins mussten gar nicht gut sein, du hast das intern geregelt.`,
    `${score} ist für dich nicht "schlechter Tag", das ist eine schriftliche Entschuldigung an die eigene Statistik.`,
    `bei Ø ${average} ist ${score} ein Tatort. Kreideumriss um die Kugel, bitte.`,
  ],
  bad: (score: number, average: number, delta: string) => [
    `${delta} Pins unter deinem Schnitt. Nicht katastrophal, aber die Normalform hat sichtbar den Bus verpasst.`,
    `${score} ist für dich schon dünnes Eis. Und du bist mit Bowlingschuhen draufgetanzt.`,
    `unter eigener Form. Nicht komplett peinlich, aber die Statistik schaut streng über den Brillenrand.`,
    `bei Ø ${average} fühlt sich ${score} an wie: Kugel dabei, Fokus zuhause gelassen.`,
  ],
  slightlyBelow: (score: number, average: number, delta: string) => [
    `${delta} Pins unter Ø ${average}. Kein Drama, eher ein kleiner statistischer Seufzer.`,
    `${score} liegt knapp unter deiner Normalform. Ärgerlich, aber noch kein Grund, die Schuhe zu verbrennen.`,
    `leicht unter Soll. Die Pins haben gewonnen, aber nur nach Punkten, nicht durch K.O.`,
    `für dich etwas mau, aber noch im Bereich "kann passieren". Leider passiert es halt schriftlich.`,
  ],
  onPar: (score: number, average: number) => [
    `${score} liegt ziemlich genau auf deinem Ø ${average}. Stabil, berechenbar, emotional mittelwarm.`,
    `das ist deine Normalform. Nicht Feuerwerk, aber auch kein Feuerwehr-Einsatz.`,
    `ziemlich exakt du selbst. Die Statistik nickt und sagt: ja, so kennen wir dich.`,
    `solide im eigenen Rahmen. Niemand fällt vom Stuhl, aber auch niemand ruft den Notarzt.`,
  ],
  above: (score: number, average: number, delta: string) => [
    `${delta} Pins über deinem Schnitt. Da darfst du kurz so tun, als wäre alles geplant gewesen.`,
    `${score} ist über deiner Normalform. Die Kugel hatte offenbar heute eine Idee.`,
    `besser als dein Ø ${average}. Nicht direkt Legende, aber die Angeberei darf leise anlaufen.`,
    `über Soll gespielt. Die Statistik wirkt überrascht, versucht es aber höflich zu verbergen.`,
  ],
  great: (score: number, average: number, delta: string) => [
    `${delta} Pins über Ø ${average}. Das ist nicht nur gut, das ist gegen deine eigene Akte ausgesagt.`,
    `${score} ist für dich stark über Normalform. Die Pins wurden heute nicht gespielt, sie wurden verwaltet.`,
    `deutlich über deinem Schnitt. Falls das Absicht war: bitte öfter. Falls nicht: trotzdem weitererzählen.`,
    `starkes Spiel relativ zu dir selbst. Die Statistik muss kurz neu sortieren, wer du heute bist.`,
  ],
  absurd: (score: number, average: number, delta: string) => [
    `${delta} Pins über deinem Schnitt. Das war kein Peak, das war Identitätsdiebstahl an deiner Normalform.`,
    `${score} bei Ø ${average}? Da hat kurz jemand anderes deine Hand benutzt. Behalten.`,
    `massiv über Normalform. Die Statistik schaut auf dich wie auf einen Druckfehler mit Selbstvertrauen.`,
    `das ist so weit über deinem Alltag, deine Durchschnittswerte verlangen einen Vaterschaftstest.`,
  ],
} as const;

export const playerScoreInfoTexts = {
  average: (average: number) => [
    `Dein Durchschnitt ist die persönliche Basislinie: Ø ${average}. Andere Spieler sind interessant, aber diese Leiste fragt vor allem: lieferst du gegen dich selbst?`,
    `Der Schnitt zeigt deine Normalform. Ab jetzt wird jeder Score daran gemessen — fairer als pauschales "80 schlecht, 120 gut".`,
    `Ø ${average} ist dein persönlicher Maßstab. Ein Score kann global okay sein und für dich trotzdem eine Vollbremsung.`,
  ],
  peak: (score: number, average: number, delta: number) => [
    `Deine Bestleistung im Vergleich zu Ø ${average}: ${score} (${delta >= 0 ? '+' : ''}${delta}). Das zeigt, wie weit dein Dach über dem Wohnzimmer hängt.`,
    `Peak-Potenzial relativ zu dir selbst. ${score} ist nicht nur eine Zahl, sondern die Frage: warum nicht öfter so, hm?`,
    `Bestes Spiel gegen deine Normalform. Je größer der Abstand zu Ø ${average}, desto mehr riecht es nach "war wohl doch nicht alles Zufall".`,
  ],
  winningPeak: (score: number, average: number, delta: number) => [
    `Dein höchster Sieg-Score relativ zu Ø ${average}: ${score} (${delta >= 0 ? '+' : ''}${delta}). Das ist dein Sieger-Peak, nicht deine Alltagsschicht.`,
    `Zeigt, wie hoch du gewinnen kannst, wenn du über deiner Normalform spielst. Oder wie sehr die anderen leiden mussten.`,
    `Bester Sieg im Eigenvergleich. Wenn der deutlich über Ø liegt, war das weniger Sieg und mehr Gruppentherapie für die anderen.`,
  ],
  cheapWin: (score: number, average: number, delta: number) => [
    `Niedrigster Sieg relativ zu Ø ${average}: ${score} (${delta >= 0 ? '+' : ''}${delta}). Manchmal reicht auch Mittelmaß, wenn die anderen freundlicherweise kollabieren.`,
    `Der billigste Sieg im Eigenvergleich. Wenn der unter deinem Schnitt liegt, hast du nicht gewonnen — die anderen haben verloren.`,
    `Zeigt, wie wenig für einen Sieg gereicht hat. Sportlich fragwürdig, emotional trotzdem gültig.`,
  ],
  winningAverage: (score: number, average: number, delta: number) => [
    `Dein Ø in gewonnenen Spielen gegen deinen Gesamt-Ø ${average}: ${score} (${delta >= 0 ? '+' : ''}${delta}). Das ist deine persönliche Sieg-Schwelle.`,
    `Zeigt, wie viel über Normalform du meistens für Siege brauchst. Wenn kaum Abstand da ist, waren die Gegner sehr höflich.`,
    `Siegpunkte im Eigenvergleich. Je höher über deinem Schnitt, desto mehr musst du liefern, bevor die Krone sitzt.`,
  ],
} as const;

// --- Median consistency: median vs. average gap (bar text for the median card) ---
// Positive diff = avg > median (a few great games pull avg up — when you're good, you're really good)
// Negative diff = median > avg (a few bad games drag avg down — normally solid but occasional disasters)
export const medianConsistency = {
  // |gap| < 1: practically identical, scary consistent
  nearIdentical: [
    'Median und Durchschnitt sind quasi dasselbe. Du bist kein Bowler, du bist ein Algorithmus.',
    'unter einem Pin Unterschied. Das ist keine Konstanz, das ist Maschinenarbeit.',
    'so nah beieinander, dass man fragen muss: spielst du jedes Spiel mit Autopilot?',
    'fast null Abweichung. Entweder Disziplin oder du triffst immer dieselben drei Pins.',
    'dein Scoring hat weniger Varianz als das Wetter in der Wüste.',
    'so vorhersehbar, dein Score könnte als Alibi vor Gericht durchgehen. "Er spielt IMMER so, Euer Ehren."',
    'null Überraschungen. Falls du mal vermisst wirst, suchen sie einfach nach jemandem, der exakt diesen Score spielt.',
  ],
  // |gap| 1-2: very consistent
  veryConsistent: [
    'Median und Schnitt kleben zusammen wie Bowlingschuhe am Teppich. Langweilig stabil.',
    'kaum Streuung. Du spielst so gleichmäßig, man könnte dich als Metronom einsetzen.',
    'fast identisch. Du lieferst jedes Mal dasselbe — im Guten wie im Mittelmäßigen.',
    'konstant wie ein Uhrwerk. Oder wie jemand, der seine Komfortzone nie verlässt.',
    'eng beieinander. Keine Überraschungen, keine Dramen, keine Geschichten für später.',
    'so berechenbar, dass deine Mitspieler deinen Score schon vor dem Spiel auf die Grabrede schreiben könnten.',
  ],
  // avg > median: when you're good, you're REALLY good — a few great games pull the average up
  avgSlightlyHigher: [
    'ab und zu knallst du ein richtig starkes Spiel raus, das den Schnitt hochzieht.',
    'dein Ø profitiert von ein paar Sahnetagen. Wenn du gut bist, bist du richtig gut.',
    'einzelne Highlights heben deinen Schnitt über den Alltag. Nicht schlecht, wenn man drauf steht.',
    'leicht nach oben verzerrt: du hast Ausreißer, aber die guten. Davon will man mehr.',
    'ein paar Glanzspiele halten deinen Schnitt am Leben wie ein Defibrillator.',
  ],
  avgMuchHigher: [
    'wenn du einen guten Tag hast, geht die Post ab. Das zieht den Schnitt ordentlich hoch.',
    'dein Ø lebt von deinen besten Tagen. Wenn du triffst, triffst du richtig.',
    'ein paar absolute Glanzleistungen heben den Schnitt weit über das Normalspiel.',
    'Highscorer-Typ: im Alltag solide, aber wenn es klickt, wird es kurz gefährlich für alle.',
    'dein Schnitt ist höher als das, was du normalerweise spielst — aber deine Peaks sind echt.',
    'deine Highlights sind wie Nahtoderfahrungen für die Gegner: selten, aber unvergesslich.',
  ],
  // median > avg: normally solid, but a few really bad games drag the average down
  medianSlightlyHigher: [
    'eigentlich spielst du besser als dein Schnitt zeigt. Ein paar schlechte Spiele drücken die Bilanz.',
    'dein Normalspiel ist stärker als der Ø behauptet — einzelne Ausrutscher kosten Punkte.',
    'der Schnitt wird von ein paar Tiefschlägen runtergezogen. Die Normalform ist besser.',
    'ein paar miese Abende ruinieren die Optik. Dein typisches Spiel ist eigentlich okay.',
    'ein paar Spiele würdest du am liebsten aus der Statistik löschen. Und aus deinem Gedächtnis.',
  ],
  medianMuchHigher: [
    'eigentlich spielst du gut, aber ein paar absolute Katastrophen versauen den Schnitt.',
    'dein Median sagt: kann was. Dein Schnitt sagt: ja, aber diese HORROR-Spiele...',
    'wenige richtig schlechte Spiele ziehen den Schnitt runter. Die Normalform ist deutlich besser.',
    'Aussetzer-Typ: meistens solide, aber wenn es schiefgeht, dann richtig.',
    'ohne deine schlimmsten Spiele wärst du eine andere Hausnummer. Leider zählen die trotzdem.',
    'deine Ausreißer nach unten sind so brutal, die bräuchten einen eigenen Grabstein in der Statistik.',
  ],
} as const;

// --- Open frame rate: % of frames without strike/spare (lower = better) ---
export const openFrame = {
  veryClean: [
    'wenige offene Frames — fast schon unverschämt ordentlich.',
    'kaum Geschenke. Sehr unsozial gegenüber der Konkurrenz.',
    'das ist aufgeräumt wie eine Steuerprüfung mit Bowlingkugel.',
    'dein Abräum-Game ist so sauber, das ist fast schon langweilig. Fast.',
    'die Pins bleiben nicht stehen. Du lässt sie einfach nicht.',
    'so gründlich, man könnte dich auf Tatorten einsetzen. Keine Spuren, keine Überlebenden.',
  ],
  controlled: [
    'Fehlerquote okay, die Katastrophenabteilung hat Pause.',
    'da bleibt genug stehen, um menschlich zu wirken — aber nicht peinlich.',
    'kontrolliertes Chaos. Also quasi Bowling mit Sicherheitsgurt.',
    'ein paar offene Frames für den Charakter, aber insgesamt sauber.',
    'genug Abräumer, um nicht in die Verlegenheit zu kommen, sich erklären zu müssen.',
    'ein paar Pins überleben, aber nicht genug, um davon zu erzählen.',
  ],
  shaky: [
    'ein paar Frames machen noch unnötig Theater wie im Vorabendprogramm.',
    'zu viele offene Türen, und leider laufen Punkte raus.',
    'das ist noch keine Katastrophe, aber der Rauchmelder piept schon.',
    'jeder zweite Frame ist offen. Das ist keine Strategie, das ist Punkte-Tourette.',
    'die Pins sagen danke und stehen einfach weiter rum.',
    'so viele offene Frames, dein Scoresheet sieht aus wie ein Schweizer Käse nach einer Schießerei.',
  ],
  tooMany: [
    'offene Frames verteilen Punkte wie Gratisproben im Supermarkt.',
    'du bist heute sehr großzügig. Leider mit deinen eigenen Punkten.',
    'die Konkurrenz sagt danke und fragt, ob noch mehr kommt.',
    'du lässt so viel stehen, die Pins könnten Miete zahlen.',
    'offene Frames am laufenden Band. Das ist kein Bowling, das ist Entwicklungshilfe für die Gegner.',
    'der zweite Wurf ist bei dir eher eine Formalie als eine Rettung.',
    'die Pins stehen am Ende noch aufrechter als dein Selbstbewusstsein.',
  ],
} as const;

// --- Win rate: % of games won against opponents ---
export const winRate = {
  dominant: [
    'deutlich mehr Siege als Niederlagen — der Rest darf Formulare einreichen.',
    'das Feld wurde nicht geschlagen, es wurde verwaltet.',
    'heute eher Endgegner als Mitspieler.',
    'deine Mitspieler sind im Grunde Statisten in deiner Heldengeschichte.',
    'so viele Siege, dass die anderen langsam aufhören, dich einzuladen.',
    'deine Siegquote ist so hoch, die anderen fragen sich, ob die Freundschaft das wert ist.',
  ],
  winning: [
    'mehr gewinnen als verlieren: simpel, unangenehm effektiv.',
    'die Bilanz grinst. Die Gegner eher nicht.',
    'genug Siege, um laut zu sein, aber bitte nicht zu laut.',
    'über 50% Winrate sagt: du bist statistisch der Feind.',
    'Gewinner-Mentalität. Oder Gegner-Schwäche. Egal, Sieg ist Sieg.',
    'du gewinnst öfter als du verlierst. Die anderen sterben jedes Mal ein bisschen innerlich.',
  ],
  balanced: [
    'oft im Rennen, selten komplett im Graben.',
    'du bist gefährlich genug, dass man dich nicht ignorieren sollte.',
    'mal Jäger, mal Verkehrshütchen — spannend bleibt es.',
    'die Siegchancen sind da, sie brauchen nur öfter die richtige Abfahrt.',
    'knapp dran, aber knapp ist bei Bowling auch nur ein anderes Wort für verloren.',
    'du schwebst zwischen Held und Opfer. Schrödinger bowlt.',
  ],
  chasing: [
    'aktuell eher Beute mit Ambitionen.',
    'die Krone ist sichtbar, aber noch hinter Glas.',
    'da ist noch viel Luft nach oben und leider auch viel Luft aktuell.',
    'Siege sind für dich eher seltene Naturereignisse als Routine.',
    'die anderen gewinnen. Du gewinnst an Erfahrung. Nicht das gleiche.',
    'Jäger ohne Munition. Motivation ist da, der Rest kommt hoffentlich noch.',
    'deine Siegquote ist so niedrig, die könnte sich auf dem Friedhof bewerben.',
  ],
} as const;

// --- Strike follow-up: % of strikes followed by another strike ---
export const strikeFollow = {
  hot: [
    'wenn einer fällt, fallen gerne gleich mehrere. Domino mit Pins.',
    'Seriengefahr. Die Pins sollten sich organisieren.',
    'das ist nicht mehr Zufall, das ist schon leicht verdächtig.',
    'Strike-Serien wie am Fließband. Die Bahn hat Angst.',
    'wenn du einmal warm bist, wird es für alle unbequem.',
    'wenn du in Serie bist, haben die Pins weniger Überlebenschance als ein Schneemann im Juli.',
  ],
  good: [
    'du wandelst Strikes oft in Serien um — nicht nur Glücksblitz mit Zeugen.',
    'Serien passieren. Noch nicht immer, aber oft genug zum Angeben.',
    'da steckt Lawinenpotenzial drin, auch wenn manchmal nur ein Schneeball kommt.',
    'der zweite Strike kommt immerhin öfter als der Nikolaus.',
    'solide Nachfolge-Quote. Nicht gruselig, aber beachtenswert.',
  ],
  normal: [
    'Serien kommen vor, aber offenbar ohne Kalenderfreigabe.',
    'manchmal wird aus Strike mehr. Manchmal halt nur ein netter Moment.',
    'noch eher Zufallsbesuch als Stammgast.',
    'ein Strike kommt, guckt sich um, und geht meistens direkt wieder.',
  ],
  rare: [
    'Strikes bleiben meist Einzelkinder.',
    'ein Strike kommt, winkt und geht direkt wieder.',
    'Serienfähigkeit aktuell im Praktikum.',
    'Folge-Strike? Kennt dein Arm nicht. Der macht nach einem Strike erstmal Pause.',
    'deine Strikes sind wie Sternschnuppen: schön, selten, und sofort vorbei.',
    'deine Strikes sterben einsam. Kein Nachfolger, keine Trauerfeier, nur Stille.',
  ],
} as const;

// --- Comeback rate: strike/spare after an open frame ---
export const comeback = {
  veryResilient: [
    'nach Fehlern kommt die Antwort mit Ansage.',
    'kurz Mist gebaut, direkt zurückgeschlagen. Frech, aber gut.',
    'Fehler werden hier nicht adoptiert, sondern rausgeworfen.',
    'du bist wie ein Stehaufmännchen mit Bowlingkugel.',
    'die Fehlerverarbeitung ist schneller als bei manchen Menschen die Trauer.',
    'du begräbst deine Fehler sofort und tanzt auf dem Grab. Eiskalt.',
  ],
  goodReaction: [
    'solide Bounce-back-Quote — Stolpern ja, Liegenbleiben nein.',
    'Fehler passieren, aber immerhin nicht als Fortsetzungsroman.',
    'du räumst nach Chaos oft direkt wieder auf. Fast erwachsen.',
    'nach Fehlern wird aufgeräumt, nicht geheult. Meistens.',
    'akzeptable Rückkehrquote. Der Sturz ist kurz, die Landung okay.',
  ],
  normal: [
    'nach Fehlern kommt manchmal direkt die Antwort, manchmal erstmal ein Räuspern.',
    'Fehlerverarbeitung vorhanden, aber noch mit Ladebalken.',
    'nicht panisch, aber auch nicht ganz souverän.',
    'nach offenen Frames ist die Reaktion eher "mal sehen" als "jetzt erst recht".',
  ],
  shaky: [
    'offene Frames laden oft Folgefehler zum Gruppenfoto ein.',
    'ein Fehler kommt selten allein — bei dir bringt er manchmal Snacks mit.',
    'nach einem Patzer wird es gerne kurz seifig.',
    'Fehler kommen in Rudeln. Dein Bowling hat Herdentrieb.',
    'ein offener Frame ist bei dir nicht das Ende, sondern erst der Anfang des Elends.',
    'nach Fehlern folgt bei dir oft ein mentaler Rohrbruch.',
    'deine Fehler vermehren sich schneller als Kaninchen. Und sind genauso schwer einzufangen.',
  ],
} as const;

// --- Finish strength: 10th frame performance vs. average frame ---
export const finish = {
  clutch: [
    'du legst im 10. Frame klar zu. Drama bekommt Absage.',
    'Unter Druck wird nicht gewackelt, sondern poliert.',
    'der 10. Frame klopft an und du öffnest mit Stahlkappe.',
    'Clutch-Gen vorhanden. Im letzten Frame wachsen dir offenbar zusätzliche Finger.',
    'wenn es drauf ankommt, lieferst du. Der Rest des Spiels ist nur Aufwärmung.',
    'im 10. Frame wirst du zum Sensenmann. Die Pins hatten keine Chance.',
  ],
  stable: [
    'kein Schlussabfall — Puls noch vorhanden, Hände brauchbar.',
    'am Ende kein Feuerwerk, aber auch keine öffentliche Kernschmelze.',
    'du bringst es heim, ohne dass jemand den Notarzt ruft.',
    'der 10. Frame ist kein Problem. Kein Highlight, aber kein Problem.',
    'solider Schluss. Du fällst nicht auseinander, wenn es zählt.',
  ],
  slightDrop: [
    'der Schlussframe wird etwas müde und sucht einen Stuhl.',
    'die Ziellinie schaut böse, und du blinzelst zuerst.',
    'am Ende wird es weich wie überkochte Nudeln.',
    'der 10. Frame hat leichte Angstsymptome.',
    'unter Druck schmilzt der Score wie Eis in der Mikrowelle.',
    'im letzten Frame stirbt leise die Hoffnung. Und ein paar Punkte gleich mit.',
  ],
  weak: [
    'am Ende verschwinden Punkte wie Socken in der Waschmaschine.',
    'der 10. Frame riecht Blut und du hältst den Hals hin.',
    'mit Druck kannst du offenbar nicht so gut umgehen — sehr menschlich, sehr teuer.',
    'im letzten Frame packt dich die Panik und dein Arm macht Urlaub.',
    'Tipp: der 10. Frame ist genauso lang wie die anderen. Einfach nochmal werfen.',
    'unter Druck wirst du nicht zum Diamanten, sondern zum Wackelpudding.',
    'dein 10. Frame ist wie ein Autounfall in Zeitlupe. Alle schauen zu, keiner kann helfen.',
  ],
} as const;

// --- Fatigue: score drop from game 1 to later games ---
export const fatigue = {
  endures: [
    'spätere Spiele sind gleich gut oder besser. Akku sagt: noch was?',
    'kein Leistungsabfall — nervig stabil.',
    'du wirst später nicht schlechter. Unverschämt praktisch.',
    'Kondition wie ein Diesel. Läuft und läuft und nervt die anderen.',
    'kein Ermüdungseffekt. Du bist eine Maschine. Eine langsame, aber eine Maschine.',
    'du wirst einfach nicht müde. Wie ein Horrorfilm-Killer. Die anderen können rennen, aber du kommst immer nach.',
  ],
  smallDrop: [
    'leichte Ermüdung — menschlich, leider nachweisbar.',
    'ein bisschen Akkuverlust, aber noch kein Drama.',
    'der Fokus gähnt kurz, bleibt aber im Gebäude.',
    'minimal weniger gut, aber noch im Bereich "war halt ein langer Abend".',
  ],
  noticeableDrop: [
    'spätere Spiele fallen ab, der Fokus sucht offenbar den Ausgang.',
    'nach hinten raus wird es dünner. Kondition sagt: mach doch selber.',
    'der Abend kaut langsam an der Präzision.',
    'je mehr Spiele, desto mehr sieht es nach "hatte mal besser angefangen" aus.',
    'dein Arm wird müde, dein Score traurig, und deine Mitspieler froh.',
    'dein Score stirbt einen langsamen Tod über den Abend. Kein Mord, eher natürliche Ursachen.',
  ],
  heavy: [
    'Kondition/Konzentration klauen Punkte mit Sturmmaske.',
    'später geht der Score baden, ohne Schwimmflügel.',
    'der Tank ist leer und der Score schiebt.',
    'nach Spiel 1 geht es bergab wie eine Kugel in die Rinne.',
    'Tipp: weniger Bier zwischen den Spielen. Oder mehr Armtraining. Oder beides.',
    'am Ende bowlst du mit dem Ehrgeiz eines nassen Handtuchs.',
    'am Ende des Abends ist dein Score klinisch tot. Nur die Maschine piept noch.',
  ],
} as const;

// --- Strikes per game ---
export const strikesPerGame = {
  strong: [
    'das knallt regelmäßig, die Pins kennen deinen Namen.',
    'genug Strikes, um kurz unangenehm selbstbewusst zu werden.',
    'die Pocket bekommt heute Besuchsrecht.',
    'drei plus Strikes pro Spiel ist für Hobbyisten fast schon obszön.',
    'die Pins fallen in Serie. Dein Arm hat offenbar ein Abo.',
    'Strike-Maschine. Naja, eher Strike-Halbautomatik, aber es läuft.',
    'du richtest die Pins hin wie ein Serienkiller. Methodisch und ohne Reue.',
  ],
  solid: [
    'gute Strike-Ausbeute, noch nicht furchteinflößend, aber nervig.',
    'ordentlich Druck auf den Kessel, ohne gleich das Haus abzureißen.',
    'da passiert was. Manchmal sogar absichtlich.',
    'regelmäßig Strikes. Nicht beängstigend oft, aber genug für Respekt.',
    'die Pins fallen, wenn du es willst. Und manchmal auch wenn nicht.',
  ],
  needsWork: [
    'mehr Pocket-Treffer, weniger Wunschdenken.',
    'Strikes sind noch eher Gastauftritte als Hauptrolle.',
    'die Pins stehen zu oft noch da und fragen: war das alles?',
    'Strike-Rate im Bereich "angenehme Überraschung, wenn es passiert".',
    'wenn ein Strike kommt, jubelt die ganze Gruppe. Weil es so selten ist.',
    'Tipp: die Kugel soll ALLE Pins treffen, nicht nur die, die Lust haben.',
    'deine Strike-Rate liegt im Bereich "vom Aussterben bedroht". Der WWF wurde informiert.',
  ],
} as const;

// --- Spares per game ---
export const sparesPerGame = {
  strong: [
    'gutes Abräumen: langweilig, effektiv, respektlos.',
    'Spares als Punktestaubsauger. Sehr ordentlich, sehr gemein.',
    'die Müllabfuhr kommt zuverlässig.',
    'Abräumen auf hohem Niveau. Sexy ist anders, aber es funktioniert.',
    'der zweite Wurf ist bei dir kein Trostpreis, sondern ein Werkzeug.',
    'du räumst ab wie ein Bestatter: gründlich, emotionslos, professionell.',
  ],
  solid: [
    'ordentliche Spare-Ausbeute, die Müllabfuhr kommt regelmäßig.',
    'nicht perfekt, aber viele Brände werden gelöscht.',
    'du lässt nicht alles liegen. Nur manches. Aus Charaktergründen.',
    'genug Spares, um nicht als fahrlässig zu gelten.',
    'Spare-Rate im gesunden Bereich. Kein Held, aber kein Verbrecher.',
  ],
  needsWork: [
    'mehr Spares bringen schnell Punkte. Revolutionäre Idee: stehengebliebene Pins treffen.',
    'die zweite Chance wird noch zu oft als Deko behandelt.',
    'Abräumen wäre hier kein Verrat an der Kunst.',
    'Spare? Kenne ich nicht. — dein zweiter Wurf, wahrscheinlich.',
    'du lässt stehen wie ein Möbelhaus. Schön anzuschauen, aber punktelos.',
    'der zweite Wurf geht bei dir oft ins Leere. Oder in die Rinne. Oder beides.',
    'du lässt so viele Pins stehen, die könnten einen Friedhof gründen. Hier ruhen die nie abgeräumten.',
  ],
} as const;

// --- First throw: average pins knocked down on first ball ---
export const firstThrow = {
  veryGood: [
    '8+ Pins: der zweite Wurf bekommt leichte Hausaufgaben.',
    'der erste Ball liefert. Der zweite darf bitte nicht sabotieren.',
    'viel fällt direkt. Effizient und ein bisschen angeberisch.',
    'der erste Wurf macht den Job. Der zweite muss nur noch nicht alles ruinieren.',
    'starke Eröffnung. Die Pins fallen wie Dominosteine — naja, fast.',
    'dein erster Ball ist wie der Tod: unausweichlich und gründlich.',
  ],
  good: [
    'solide Grundlage, noch kein Denkmal, aber Fundament steht.',
    'der erste Wurf macht meistens was Sinnvolles. Schon mal stark.',
    'guter Start, wenig Clownshow.',
    'die meisten Pins fallen beim ersten Kontakt. Ordentlich.',
    'genug Schaden für eine realistische Spare-Chance.',
  ],
  normal: [
    'mehr Pocket-Treffer würden helfen, weniger Zufall auch.',
    'okay, aber der erste Ball könnte öfter Chef sein.',
    'da fällt was, aber noch nicht genug für entspanntes Grinsen.',
    'sechs Pins im Schnitt heißt: der zweite Wurf hat richtig Arbeit.',
    'halbwegs okay, aber die Pins schauen noch zu entspannt.',
  ],
  needsWork: [
    'der erste Wurf sollte Pins treffen, nicht nur Stimmung erzeugen.',
    'zu wenig Schaden beim ersten Ball. Die Pins fühlen sich zu sicher.',
    'der Start braucht mehr Substanz und weniger Hoffnung.',
    'der erste Wurf ist bei dir eher eine Ankündigung als eine Aktion.',
    'Tipp: Ziel ist das dreieckige Ding aus Pins. Nicht der Bereich daneben.',
    'dein erster Wurf erschreckt die Pins nicht mal. Die lachen.',
    'dein erster Ball trifft so wenig, er könnte auf der Vermisstenanzeige für Präzision stehen.',
  ],
} as const;

// --- Best strike streak: longest consecutive strikes in a game ---
export const streak = {
  veryRare: [
    '4+ Strikes am Stück — da darf die Bahn Anzeige erstatten.',
    'das ist keine Serie mehr, das ist ein kleiner Überfall.',
    'die Pins wurden sequenziell gedemütigt.',
    'vier oder mehr am Stück? Unter Hobbyisten ist das quasi ein Verbrechen.',
    'da war jemand kurz in einem anderen Bewusstseinszustand.',
    'deine Mitspieler haben aufgehört zu zählen und angefangen zu fluchen.',
    'vier Strikes am Stück. Die Pins wurden nicht besiegt, sie wurden ausgelöscht. Ganze Generationen, weg.',
  ],
  turkey: [
    'kurz sah es nach Profi-Cosplay aus.',
    'Turkey: genug, um lässig zu wirken, nicht genug für Bescheidenheit.',
    'drei am Stück — die Arroganz darf kurz die Jacke ausziehen.',
    'Turkey! Für den Moment warst du der beste Bowler im Raum. Vielleicht sogar absichtlich.',
    'drei Strikes in Folge: offiziell berechtigt, den ganzen Abend davon zu erzählen.',
    'Turkey. Drei Strikes, drei Trauerfeiern für die Pins. Gedenkminute gibt es nicht.',
  ],
  double: [
    'solide Serienfähigkeit. Kurz war Musik drin.',
    'zwei Strikes: ein Anfang, kein Lebenswerk.',
    'Double ist nett. Die dritte Einladung wurde offenbar ignoriert.',
    'zwei am Stück, dann war Schluss. Wie ein guter Witz ohne Pointe.',
    'ein Double. Halbwegs beeindruckend. Der dritte Strike hat leider den Bus verpasst.',
  ],
  single: [
    'der Strike kam allein und wollte offenbar auch so bleiben.',
    'ein Strike ist ein Statement. Ein sehr kurzes.',
    'Serienplanung aktuell: spontan und sofort beendet.',
    'Einzelstrike: schön, einsam, und sofort vergessen.',
    'ein Strike, dann zurück zum normalen Chaos. Kurzer Urlaub.',
  ],
  none: [
    'erster Meilenstein: überhaupt mal eine Lawine starten.',
    'Serienfähigkeit schläft noch im Geräteraum.',
    'da ist noch viel Platz zwischen Wunsch und Wirklichkeit.',
    'kein einziger Strike? Nicht mal einen? Dein Arm und die Pins müssen sich dringend kennenlernen.',
    'Serie: null. Aber hey, du hast Spaß. Das zählt. Nur nicht in der Statistik.',
    'null Strikes. Stille. Nur das leise Weinen deines Scoresheets.',
  ],
} as const;

// --- Median vs. average: consistency indicator (info-tip) ---
export const medianAverage = {
  avgHigher: (diff: number) => [
    `Median vs. Durchschnitt: Dein Ø liegt ${diff} Pins über dem Median. Ein paar Glanzlichter schminken die Bilanz, der Alltag kommt ungeschminkt zur Tür rein.`,
    `Ø ${diff} Pins über Median: ein paar Heldentaten ziehen den Schnitt hoch, während die Normalform hinten nervös winkt.`,
    `Der Durchschnitt trägt Make-up: ${diff} Pins über Median. Da haben einzelne Ausreißer ordentlich Beauty-Filter gespielt.`,
    `${diff} Pins Unterschied: dein Schnitt wird von Ausreißern getragen wie ein Crowdsurfer. Ohne die Highlights wärst du... naja.`,
  ] as const,
  medianHigher: (diff: number) => [
    `Median vs. Durchschnitt: Dein Median liegt ${diff} Pins über dem Ø. Meistens stabil, aber ein paar Ausrutscher haben die Statistik mit Schlamm beworfen.`,
    `Median ${diff} Pins über Ø: eigentlich stabil, nur einzelne Spiele sind statistischer Vandalismus.`,
    `Der Median sagt 'läuft', der Durchschnitt sagt 'aber erinnerst du dich an DIESE Katastrophe?'.`,
    `Eigentlich bowlst du okay, aber ${diff} Pins werden von ein paar Katastrophen-Spielen geklaut. Die sind wie Steuern, nur unfairer.`,
  ] as const,
  close: [
    'Median vs. Durchschnitt: Beide liegen nah beieinander. Wenig Drama, viel Konstanz — fast schon verdächtig professionell für diesen Zirkus.',
    'Median und Ø sind nah zusammen. Keine großen Ausreißer, keine Ausreden, leider auch weniger Soap-Opera.',
    'Konstanz erkannt. Das ist entweder Können oder sehr gleichmäßiges Chaos.',
    'Median und Durchschnitt sind quasi Zwillinge. Du bowlst zuverlässig — im Guten wie im Mittelmäßigen.',
  ],
} as const;

// --- Finish strength info: 10th frame vs. normal frame (info-tip text) ---
export const finishInfo = {
  clutch: [
    'Vergleicht den 10. Frame mit deinem normalen Frame. Unter Druck entstehen hier offenbar Diamanten — oder wenigstens sehr laute Kiesel.',
    '10. Frame vs. normaler Frame: Wenn es zählt, wirst du besser. Widerlich nützlich.',
    'Am Ende packst du drauf. Der Druck fragt, und du antwortest unhöflich.',
    'Du wirst im letzten Frame stärker. Das ist entweder Clutch oder Panik-Power. Beides zählt.',
  ],
  stable: [
    'Vergleicht den 10. Frame mit deinem normalen Frame. Am Ende bleibt der Puls okay — kein Feuerwerk, aber auch kein öffentliches Zerfallen.',
    'Solider Schluss. Nicht episch, aber immerhin kein dramatisches Wegschmelzen.',
    'Der 10. Frame macht dir keine Angst. Respekt, oder sehr gute Verdrängung.',
    'Am Ende passiert nichts Besonderes. Aber "nichts Besonderes" schlägt "kompletten Zusammenbruch".',
  ],
  slightDrop: [
    'Vergleicht den 10. Frame mit deinem normalen Frame. Der Schluss wird dünner; die Ziellinie schaut böse und du schaust zurück.',
    'Im 10. Frame geht etwas Luft raus. Keine Katastrophe, aber die Hand wird offenbar etwas weich.',
    'Der Schluss wackelt. Nicht schlimm, aber der Druck hat deine Nummer.',
    'Leichter Einbruch am Ende. Dein Arm sagt: ich hatte einen langen Tag.',
  ],
  weak: [
    'Vergleicht den 10. Frame mit deinem normalen Frame. Mit Druck kannst du offenbar nicht so gut umgehen — der 10. Frame riecht Blut und du hältst den Hals hin.',
    'Im 10. Frame fallen Punkte weg wie schlechte Vorsätze im Januar.',
    'Schlussframe? Eher Stresstest mit sichtbaren Schäden.',
    'Der 10. Frame ist bei dir wie Montag: alle wissen, dass es schlimm wird, aber es passiert trotzdem.',
    'Am Ende brichst du ein wie ein IKEA-Regal. Sah stabil aus, war es nicht.',
  ],
} as const;

// --- First throw info: average first-ball pins + second-throw zero rate ---
export const firstThrowInfo = {
  strongButZeroes: (zeroRate: string) => [
    `Ø Pins mit dem ersten Wurf plus ${zeroRate}% Nuller im zweiten: Du spielst wohl gerne nur mit ersten Würfen. Der zweite Ball ist nur Deko mit Rückgaberecht.`,
    `Erster Ball stark, zweiter Ball mit ${zeroRate}% Nullern: Das ist wie ein guter Trailer für einen miesen Film.`,
    `Der erste Wurf kocht, der zweite lässt anbrennen. ${zeroRate}% Nuller sind ein klares Bewerbungsschreiben für Chaos.`,
    `Erst Held, dann Null. ${zeroRate}% Nuller im zweiten Wurf — das ist kein Bowling, das ist Persönlichkeitsspaltung.`,
  ] as const,
  strong: [
    'Ø Pins mit dem ersten Wurf. Der erste Ball macht seinen Job — danach bitte nichts Dummes tun, also die schwierigere Hälfte.',
    'Starker erster Ball. Der zweite muss nur noch nicht peinlich sein.',
    'Der erste Wurf liefert regelmäßig. Bitte dem zweiten Wurf die Adresse geben.',
    'Der erste Ball trifft. Jetzt noch dafür sorgen, dass der zweite nicht alles zunichtemacht.',
  ],
  zeroes: (zeroRate: string) => [
    `Ø Pins mit dem ersten Wurf. Dazu ${zeroRate}% Nuller im zweiten Wurf: der zweite Ball braucht kein Motivationsgespräch, der braucht Therapie.`,
    `${zeroRate}% Nuller im zweiten: Da wird Nachwerfen zur Performancekunst.`,
    `Der zweite Wurf hat bei ${zeroRate}% Nullern offenbar oft Homeoffice.`,
    `${zeroRate}% Nuller: dein zweiter Wurf trifft öfter die Rinne als die Pins. Zielwasser könnte helfen.`,
  ] as const,
  normal: [
    'Ø Pins mit dem ersten Wurf. Je höher der Wert, desto leichter werden Spares und desto weniger muss der zweite Ball Feuerwehr, Anwalt und Seelsorge spielen.',
    'Der erste Wurf legt die Arbeit vor. Je mehr fällt, desto weniger muss danach improvisiert werden.',
    'Misst, wie viel Schaden der erste Ball macht. Mehr Schaden, weniger Panik beim Nachwurf.',
    'Erster Wurf = Fundament. Je mehr fällt, desto weniger Stress. Klingt einfach. Ist es nicht.',
  ],
} as const;

// --- Spare info: spare conversion context with open frame rate ---
export const spareInfoTexts = {
  openAndZeroes: (zeroRate: string) => [
    `Spares stabilisieren Scores. Bei ${zeroRate}% Nullern im zweiten Wurf lässt du aber Kleingeld, Scheine und vermutlich die EC-Karte auf der Bahn liegen.`,
    `Viele offene Frames plus ${zeroRate}% Nuller im zweiten: Das ist keine Spare-Strategie, das ist Punkte-Kompostierung.`,
    `Der zweite Wurf sollte retten, nicht winken. ${zeroRate}% Nuller sagen: Retter im Urlaub.`,
    `Offene Frames UND Nuller? Du schaffst es, zweimal pro Frame zu enttäuschen. Das ist fast beeindruckend.`,
  ] as const,
  tooOpen: [
    'Spares stabilisieren Scores. Deine offenen Frames sagen: da werden noch zu viele Punkte verschenkt — sehr großzügig, leider an Gegner.',
    'Zu viele offene Frames. Das Scoreboard bekommt Mitleid, aber keine Punkte.',
    'Abräumen wäre hier kein Luxus, sondern Brandschutz.',
    'Spare-Rate zu niedrig. Dein zweiter Wurf ist eher ein Alibi als eine Lösung.',
    'Du verschenkst Punkte wie ein defekter Geldautomat.',
  ],
  normal: [
    'Spares stabilisieren Scores. Wenn Strikes Diva spielen, halten Spares den Abend zusammen wie Panzertape auf einer schlechten Idee.',
    'Spares sind unspektakulär, aber sie zahlen Miete im Score.',
    'Gutes Abräumen ist nicht sexy, aber es gewinnt stille Kriege.',
    'Spares sind die Arbeitstiere des Bowlings. Nicht glamourös, aber die halten den Laden am Laufen.',
  ],
} as const;

// --- Comeback info: recovery after open frames ---
export const comebackInfo = {
  chaosButRecovers: [
    'Nach offenen Frames antwortest du oft direkt mit Strike oder Spare. Erst den Brand legen, dann Feuerwehr spielen — immerhin ist die Feuerwehr wach.',
    'Du machst Chaos und räumst danach auf. Nicht elegant, aber wenigstens nicht komplett verantwortungslos.',
    'Fehler ja, Panik nein. Du baust das Loch und legst direkt eine Leiter rein.',
    'Dein Stil: erst verkacken, dann retten. Dramatisch, unnötig, aber es funktioniert.',
  ],
  chaosNoRecovery: [
    'Nach offenen Frames kommt zu selten direkt die Antwort. Ein Fehler lädt offenbar seine Freunde ein und ihr macht Gruppenurlaub.',
    'Zu viele offene Frames, zu wenig direkte Reparatur. Das ist kein Bounce-back, das ist Nachgeben.',
    'Wenn ein Frame kippt, kippt manchmal gleich die Stimmung mit.',
    'Offene Frames kommen in Rudeln. Du hast kein Comeback-Programm, du hast eine Abwärtsspirale.',
    'Nach einem Fehler kommt der nächste. Und dann noch einer. Bowling-Domino, aber rückwärts.',
  ],
  goodComeback: [
    'Nach Fehlern kommt oft direkt eine Antwort. Kurz stolpern, dann so tun, als wäre das eine taktische Bodenprobe gewesen.',
    'Gute Fehlerverarbeitung. Du fällst hin und beschwerst dich beim Boden.',
    'Patzer passieren, aber du lässt sie selten lange reden.',
    'Nach Fehlern wird nicht diskutiert, sondern geliefert. Respekt.',
  ],
  normal: [
    'Misst, wie oft nach einem offenen Frame direkt Strike oder Spare folgt. Fehlerverarbeitung statt Pressekonferenz mit Ausreden.',
    'Zeigt, ob du nach Fehlern zurückbeißt oder erstmal die Tapete anschaust.',
    'Nach offenen Frames zählt die Reaktion. Jammern bringt leider keine Pins.',
    'Comeback-Rate: wie schnell du nach einem Fehler wieder funktionierst. Oder eben nicht.',
  ],
} as const;

// --- Strike follow info: context for strike-follow rate (info-tip text) ---
export const strikeFollowInfoTexts = {
  hotAndStreaky: [
    'Misst Folge-Strikes nach einem Strike. Wenn du warm bist, wird es kurz gefährlich für alle anderen — und unangenehm für deren Ego.',
    'Strike-Folge plus Serie: Da wird aus einem Treffer direkt eine Drohung.',
    'Wenn der erste Strike fällt, schauen die nächsten Pins schon nervös.',
    'Serienfähig UND -willig. Das ist die Kombi, die den Gegner zum Schwitzen bringt.',
  ],
  lonely: [
    'Misst Folge-Strikes nach einem Strike. Aktuell eher Einzelereignis als Lawine — ein Strike kommt, winkt und verlässt die Party früh.',
    'Ein Strike bleibt oft allein. Bindungsangst auf der Bowlingbahn.',
    'Serienbildung ist aktuell noch theoretisches Material.',
    'Deine Strikes sind Einzelgänger. Die kennen sich untereinander nicht mal.',
    'Folge-Strike? Dein Arm sagt nach einem Strike: Feierabend. Bis zum nächsten Zufall.',
  ],
  normal: [
    'Misst Folge-Strikes nach einem Strike. Einzelne gute Würfe sind nett, Serien sind der eigentliche Flex; alles andere ist Pin-Flirt ohne Commitment.',
    'Zeigt, ob ein Strike Auftakt oder nur Zufall mit Beleuchtung ist.',
    'Serien sind das Ziel. Einzelstrikes sind nur der Smalltalk.',
    'Ein Strike ist ein Versprechen. Die Frage ist, ob du es hältst.',
  ],
} as const;

// --- Day score: winning/losing score rating for daily stats ---
export const dayScore = {
  legendary: [
    'über 200 unter Hobbyisten? Das ist praktisch Hochverrat am Spaßlevel.',
    'das war kein Bowling, das war ein Attentat auf die Gruppenharmonie.',
    'bei dem Score fragt man sich, ob jemand heimlich einen Profi eingeschleust hat.',
    'zweihundert-plus als Hobbyist: offiziell berechtigt, den Rest des Jahres davon zu erzählen.',
    'der Score hat die Gruppenchemie getötet. Todesursache: Überdosis Können.',
  ],
  strong: [
    'das war kein Sieg, das war eine Räumungsklage.',
    'die Konkurrenz durfte zuschauen und innerlich kündigen.',
    'Peak des Abends. Kurz war es sehr still.',
    'damit kann man angeben. Und man wird. Den ganzen Abend.',
    'wer das hinlegt, braucht keine Freunde mehr. Die hat man danach eh weniger.',
  ],
  good: [
    'damit muss der Rest erstmal leben.',
    'kein billiger Sieg, eher Premium-Ärger für die anderen.',
    'das reicht für Respekt und ein bisschen Hassliebe.',
    'solide Leistung, die den Gegner zum Nachdenken bringt. Oder zum Trinken.',
    'genug Punkte, um den Abend mit erhobenem Haupt zu verlassen.',
  ],
  solid: [
    'keine Poesie, aber Punkte sind Punkte.',
    'nicht spektakulär, aber ausreichend unangenehm.',
    'stabil genug, um nicht diskutiert zu werden.',
    'der Score sagt: ich war da. Nicht mehr, nicht weniger.',
    'reicht, um den Abend ohne Schuldgefühle zu beenden.',
  ],
  shaky: [
    'gewonnen vielleicht, schön war es nicht zwingend.',
    'das war mehr Durchkommen als Durchmarsch.',
    'ein Score mit Sicherheitsweste.',
    'technisch ein Sieg. Emotional eher ein Verhandlungsergebnis.',
    'damit gewinnt man, wenn die anderen noch schlechter spielen. Und das sagt viel.',
  ],
  cheap: [
    'wenn das reicht, hatte der Abend kollektiv Ladehemmung.',
    'Sieg ja, Ruhm eher nicht.',
    'das Podium war heute wohl auf Rabatt.',
    'damit gewonnen zu haben ist weniger Stolz als statistischer Zufall.',
    'wenn DAS der Siegscore ist, war der Abend sportlich gesehen eine Katastrophe.',
    'der Score ist so niedrig, er bräuchte eine Grabrede statt einer Siegesrede.',
  ],
} as const;

// --- Loss score: score benchmark but for games you LOST (bitter/sympathetic tone) ---
// High loss = you played well but someone was better. Low loss = just a bad game.
export const lossScore = {
  legendary: [
    'über 200 gespielt und trotzdem verloren. Das ist kein Trost, das ist seelische Grausamkeit.',
    'mit dem Score verloren? Wer auch immer gewonnen hat, schuldet dir eine Therapiesitzung.',
    'zweihundert-plus und kein Sieg. Das ist wie eine Beförderung mit gleichzeitiger Kündigung.',
    'damit verloren zu haben ist statistisch gesehen ein Kriegsverbrechen.',
  ],
  veryStrong: [
    'starker Score, aber jemand war stärker. Das Leben ist kein Wunschkonzert, und Bowling erst recht nicht.',
    'damit hätte man an jedem anderen Abend gewonnen. Heute nicht. Pech mit Stil.',
    'so hoch verloren, dass die Niederlage fast schon Respekt verdient.',
    'das war kein schlechtes Spiel, das war ein besserer Gegner. Tut trotzdem weh.',
    'starke Leistung, falscher Abend. Dein Score weint leise in der Ecke.',
  ],
  strong: [
    'ordentlich gespielt und trotzdem leer ausgegangen. Bowling hat keinen Fairness-Beauftragten.',
    'der Score war gut, der Gegner war besser. Klassische Tragödie mit Leihschuhen.',
    'solide Punktzahl, kein Sieg. Manchmal reicht gut einfach nicht.',
    'stark genug zum Gewinnen, aber heute war jemand frecher.',
    'guter Score in der falschen Runde. Timing ist alles, und deins war daneben.',
  ],
  solid: [
    'mittlerer Score, keine Krone. Nicht dramatisch, aber auch nicht lustig.',
    'solide, aber nicht solide genug. Knapp daneben ist auch vorbei.',
    'okay gespielt, aber der Sieg ging woanders hin. Wie ein Paket an die falsche Adresse.',
    'reicht normalerweise. Heute war normalerweise nicht genug.',
  ],
  shaky: [
    'mit dem Score verlieren ist weder Überraschung noch Tragödie. Eher Routine.',
    'nicht gewonnen, aber war das realistisch? Eher so mittel.',
    'der Score erklärt die Niederlage. Da braucht man keinen Detektiv.',
    'verloren, und der Score sagt: ja, war absehbar.',
  ],
  weak: [
    'verloren mit einem Score, der schon im Stehen tot war.',
    'mit dem Score zu verlieren ist keine Niederlage, das ist eine Selbstverständlichkeit.',
    'der Score war schon vor dem Ergebnis eine Beerdigung. Der Sieg hätte ein Wunder gebraucht.',
    'hier gibt es nichts zu retten. Der Score war Komplize der Niederlage.',
  ],
} as const;

// --- Day loss score: same as lossScore but for the day stats view ---
export const dayLossScore = {
  legendary: [
    'über 200 und verloren? Der Gewinner hat entweder geschummelt oder einen Pakt geschlossen.',
    'damit verloren zu haben ist eine olympische Disziplin in Ungerechtigkeit.',
    'so hoch verloren — das tut weh auf einem Level, das Worte kaum beschreiben.',
  ],
  strong: [
    'starker Score, aber heute reichte stark nicht. Das Scoreboard kennt kein Mitleid.',
    'damit verloren? Irgendwer hatte heute einen unanständig guten Abend.',
    'gute Leistung, kein Pokal. Willkommen im Club der bitteren Zweiten.',
    'die Niederlage mit diesem Score ist wie ein Fünf-Sterne-Menü im falschen Restaurant.',
  ],
  good: [
    'ordentlicher Score, aber der Sieg ging an jemand anderen. Trostpreis: Charakter.',
    'gut gespielt, schlecht abgeschnitten. Das Universum hat Humor.',
    'der Score war respektabel. Die Platzierung leider nicht.',
    'genug Punkte für Stolz, zu wenig für den Sieg. Die bitterste Kombination.',
  ],
  solid: [
    'solider Score, der heute eben nicht gereicht hat. Kein Drama, aber auch kein Spaß.',
    'mittlere Punktzahl, keine Krone. Das Mittelfeld ist ein einsamer Ort.',
    'reicht an guten Tagen. Heute war kein guter Tag.',
  ],
  shaky: [
    'mit dem Score war der Sieg eher Wunschdenken als Strategie.',
    'verloren, und ehrlich gesagt: der Score hatte es verdient.',
    'Niederlage bei dem Score ist wie Regen im November. Erwartet und trotzdem unangenehm.',
  ],
  cheap: [
    'mit dem Score verlieren ist keine Nachricht, das ist Normalzustand.',
    'der Score war so niedrig, selbst die Niederlage fühlt sich teilnahmslos an.',
    'verloren, und der Score sagt: was hast du erwartet?',
    'bei dem Score ist die Frage nicht warum verloren, sondern warum überhaupt angetreten.',
  ],
} as const;

// --- Games played: how many games in a session ---
export const games = {
  marathon: [
    'irgendwann spielt nicht mehr Skill, sondern Überleben.',
    'ab hier zählen Kondition, Trotz und schlechte Entscheidungen.',
    'genug Spiele, um jede Ausrede mehrfach zu testen.',
    'sechs plus Spiele? Das ist kein Bowling mehr, das ist ein Ausdauersport mit Snacks.',
    'ab Spiel 6 bowlt nicht mehr der Arm, sondern der Sturkopf.',
    'so viele Spiele, dass die Bahn langsam dein Grab wird. Hier ruht dein Arm.',
  ],
  decent: [
    'genug Daten, um Ausreden schwerer zu machen.',
    'kurz genug für Spaß, lang genug für Wahrheit.',
    'eine brauchbare Stichprobe mit leichter Demütigungsgefahr.',
    'drei bis fünf Spiele: der Sweet Spot zwischen Spaß und Erschöpfung.',
  ],
  short: [
    'kleine Stichprobe — perfekt, um schlechte Zahlen wegzuerklären.',
    'zu kurz für harte Urteile, aber nie zu kurz für freche Kommentare.',
    'Mini-Abend. Die Statistik trägt noch Schwimmflügel.',
    'ein bis zwei Spiele: da war jemand entweder schnell fertig oder schnell frustriert.',
    'so wenig Spiele, die Bahn weiß nicht mal, dass du da warst. Wie ein Geist, nur schlechter.',
  ],
} as const;

// --- Total pins: sum of all pins for the day ---
export const totalPins = {
  massacre: [
    'die Bahn hat heute ordentlich Material verloren.',
    'da wurden Pins entfernt, als gäbe es Abrissprämie.',
    'viel gefallen, wenig Gnade.',
    'kollektives Gemetzel. Die Pins brauchen nach diesem Abend einen Therapeuten.',
    'so viele Pins gefallen, dass man fast Mitleid bekommt. Fast.',
    'Massengrab auf Bahn 3. Keine Überlebenden unter den Pins.',
  ],
  solid: [
    'viel gefallen, wenig peinlich.',
    'kein Massaker, aber genug Lärm fürs Ego.',
    'ordentlich Arbeit an den Pins verrichtet.',
    'die Bahn hat was abbekommen. Nicht brutal, aber spürbar.',
  ],
  low: [
    'die Pins wurden eher höflich angefragt als umgeworfen.',
    'Pinschonung. Nachhaltig, aber sportlich fragwürdig.',
    'da blieb zu viel stehen und zu wenig Stolz übrig.',
    'die Pins hatten heute einen entspannten Abend. Ihr offenbar auch.',
    'wenig Zerstörung. Die Pins haben sich untereinander gelangweilt.',
    'die Pins haben den Abend unbeschadet überlebt. Glückwunsch — an die Pins.',
  ],
} as const;

// --- Average per game: total pins / games, normalized per player ---
export const avgPerGame = {
  strong: [
    'starker Abend, wenig kollektives Rumgeeier.',
    'die Gruppe hat geliefert. Unangenehm seriös.',
    'hoher Schnitt, niedrige Ausredenquote.',
    'wenn alle so spielen, braucht die Gruppe keinen Trash-Talk. Aber wir machen trotzdem.',
  ],
  solid: [
    'solider Gruppenschnitt, die Würde blieb größtenteils intakt.',
    'brauchbarer Abend. Niemand muss den Namen wechseln.',
    'nicht brutal, aber respektabel genug fürs Gruppenchat-Protokoll.',
    'ordentlich für Hobbyisten. Kein Grund für Scham, kein Grund für Champagner.',
  ],
  mixed: [
    'gemischter Abend: Punkte da, Chaos auch.',
    'man erkennt Sport, aber auch sehr viel Improvisation.',
    'Durchschnitt mit Helm und Knieschonern.',
    'die Gruppe hat gemischt performed. Manche gut, manche... anwesend.',
  ],
  weak: [
    'kollektive Pinschonung. Umweltfreundlich, sportlich fragwürdig.',
    'die Gruppe hat heute mehr Charakter als Pins gezeigt.',
    'das war gemeinschaftliches Kugelschubsen mit Ergebnisbeilage.',
    'gemeinsam schlecht ist auch zusammen. Teambuilding mal anders.',
    'unter 90 pro Kopf: der Abend war offensichtlich mehr Gesellschaftsevent als Sport.',
    'kollektives Versagen. Immerhin: niemand muss sich alleine schämen.',
  ],
} as const;

// --- Underdog: player who overperformed their own average the most ---
export const underdog = {
  plotTwist: [
    'heute wurde die eigene Statistik öffentlich beleidigt.',
    'die Normalform wurde ausgetrickst und steht jetzt draußen.',
    'unerwartet stark. Der Zufall verlangt Credits.',
    '20% über dem eigenen Schnitt? Das ist kein Bowling, das ist ein Wunder mit Leihschuhen.',
    'entweder wurde heimlich trainiert oder die Sterne standen richtig. Oder das Bier.',
    'Auferstehung auf der Bowlingbahn. Lazarus hätte applaudiert.',
  ],
  overperformed: [
    'deutlich besser als sonst — verdächtig, aber erlaubt.',
    'heute wurde über dem eigenen Schatten getanzt.',
    'die Statistik fragt: seit wann kannst du das?',
    'klar über dem eigenen Schnitt. Der Normalfall guckt verwirrt.',
    'überraschend gut. Die anderen ärgern sich, weil die Ausrede "der kann das nicht" nicht mehr zieht.',
  ],
  slightlyAbove: [
    'besser als der eigene Alltag, immerhin.',
    'kleines Plus, großer Anspruch auf Applaus eher nicht.',
    'ein bisschen über Normalform. Wir nehmen, was wir kriegen.',
    'minimal besser als sonst. Quasi ein persönlicher Feiertag.',
  ],
  noMoment: [
    'heute gewann eher die Realität.',
    'die Überraschung blieb im Auto.',
    'kein Märchen, eher Verwaltungsakt.',
    'niemand hat heute über sich hinausgewachsen. Schade, aber ehrlich.',
    'keine Underdog-Story. Nur die kalte, unbarmherzige Wahrheit der Zahlen.',
  ],
} as const;

// --- Lowest win: cheapest winning score of the day ---
export const lowestWin = {
  none: [
    'Niedrigster Score, der heute zum Sieg gereicht hat. Ohne Siege keine Pointe.',
    'Hier stünde der billigste Sieg. Heute leider ohne Material.',
    'Keine Siege, keine günstigen Pokale.',
  ],
  unfair: (win: number, loss: number) => [
    `Heute reichten ${win} zum Sieg, aber jemand verlor mit ${loss}. Sport ist manchmal einfach frech.`,
    `${win} gewann, ${loss} verlor. Das Scoreboard hat Humor und keine Moral.`,
    `Billiger Sieg bei ${win}, bittere Niederlage bei ${loss}. Willkommen im Unfairness-Simulator.`,
    `${win} reichte zum Sieg, während jemand mit ${loss} verlor. Das Leben ist kein Ponyhof, und Bowling erst recht nicht.`,
  ] as const,
  cheap: (win: number) => [
    `Heute reichten ${win} zum Sieg. Das war kein Triumphzug, eher durch die Seitentür reingeschlichen.`,
    `${win} als Siegscore: Pokal ja, Glanz eher gebraucht.`,
    `Mit ${win} gewonnen. Das ist effizient oder einfach frech niedrig.`,
    `${win} Punkte und gewonnen — das sagt weniger über den Sieger als über das Niveau des Abends.`,
  ] as const,
  normal: (win: number) => [
    `Heute reichten mindestens ${win} zum Sieg. Kein Gratispokal, aber auch kein Mount Everest.`,
    `${win} war die Eintrittskarte zum Sieg. Fair, aber nicht furchteinflößend.`,
    `Niedrigster Sieg bei ${win}. Solide Schwelle, wenig Skandal.`,
    `${win} als Mindestsieg. Für Hobbyisten ist das eine faire Ansage.`,
  ] as const,
} as const;

// --- Highest loss: best score that still lost ---
export const highestLoss = {
  none: [
    'Höchster Score, der heute trotzdem verloren hat. Keine Niederlagen, kein Drama.',
    'Keine höchste Niederlage. Heute fehlt das Tragödienmaterial.',
    'Ohne Verlierer keine bitteren Legenden.',
  ],
  aboveAvgWin: (loss: number) => [
    `Mit ${loss} verloren, obwohl das über/nahe Ø-Siegniveau liegt. Klassischer Fall von: gutes Spiel, falscher Gegner.`,
    `${loss} und trotzdem verloren. Das ist kein Scheitern, das ist schlechtes Timing mit Kugel.`,
    `Höchste Niederlage ${loss}: stark gespielt, aber jemand musste natürlich übertreiben.`,
    `${loss} Punkte und trotzdem verloren. Das ist nicht fair, aber Bowling ist kein Fairness-Seminar.`,
  ] as const,
  normal: (loss: number) => [
    `Höchster Score ohne Sieg. Stark genug für Hoffnung, nicht stark genug für die Krone.`,
    `${loss} als beste Niederlage: respektabel, aber die Krone blieb unbeeindruckt.`,
    `Verloren mit ${loss}. Da war was drin, nur eben nicht genug.`,
    `${loss} Punkte und kein Sieg. Das tut weh. Vor allem, weil man nichts dafür kann. Oder doch. Wahrscheinlich doch.`,
  ] as const,
} as const;

// --- Player day context: per-player line on the day leaderboard ---
export const playerDay = {
  // Leader with big gap to second place (30+ pins)
  leaderBigGap: (gap: number) => [
    `👑 Tagesboss mit ${gap} Pins Vorsprung. Das war kein Wettbewerb, das war eine Hinrichtung mit Leihschuhen.`,
    `👑 ${gap} Pins vor dem Zweiten. Die anderen waren heute Kulisse in deinem Solofilm.`,
    `👑 Platz 1, und zwar mit Abstand. ${gap} Pins Vorsprung sind kein Sieg, das ist eine Demütigung.`,
    `👑 Dominiert. ${gap} Pins Vorsprung — die anderen können ihre Kugeln auch direkt in die Rinne werfen, spart Zeit.`,
    `👑 +${gap} auf Platz 2. Du hast nicht gewonnen, du hast die anderen zerstört.`,
    `👑 ${gap} Pins. Du hast die anderen nicht geschlagen, du hast ihren Lebenswillen gebrochen.`,
  ] as const,
  // Leader with comfortable gap (15-29 pins)
  leaderComfortable: (gap: number) => [
    `👑 Tagesboss. ${gap} Pins Vorsprung — deutlich genug, dass sich Diskussion erübrigt.`,
    `👑 Klar vorne. ${gap} Pins Abstand zum Feld. Heute durften die anderen dekorativ mitspielen.`,
    `👑 +${gap} auf den Zweiten. Das ist nicht knapp, das ist komfortabel. Unangenehm komfortabel.`,
    `👑 ${gap} Pins Polster. Du konntest dir Fehler leisten und hast trotzdem gewonnen. Frech.`,
  ] as const,
  // Leader with close win (0-5 pins)
  leaderCloseWin: (gap: number) => [
    `👑 Gewonnen, aber nur mit ${gap} Pins Vorsprung. Das war kein Sieg, das war ein Herzinfarkt mit Happy End.`,
    `👑 Platz 1, aber ${gap} Pins sind Zittersieg. Fast hätte jemand anderes hier gestanden.`,
    `👑 Haarscharf vorne. ${gap} Pins trennen Held von Durchschnitt. Heute wars knapp genug für Schweißflecken.`,
    `👑 ${gap} Pins Vorsprung. Das ist weniger Dominanz und mehr Glück mit Anlauf.`,
    `👑 Knapper Sieg. Bei ${gap} Pins Unterschied hätte ein einziger Spare den Abend gedreht.`,
  ] as const,
  // Leader default (6-14 pins gap)
  leaderDefault: [
    '👑 Tagesboss. Heute durften die anderen dekorativ mitspielen.',
    '👑 Ganz oben. Die anderen waren heute eher Hintergrundrauschen.',
    '👑 Platz 1. Bitte nicht bescheiden werden, das glaubt eh keiner.',
    '👑 Gewonnen. Und egal wie: gewonnen ist gewonnen. Der Score steht, die Gegner nicht.',
  ],
  // Last place with huge gap (30+ pins behind, 3+ players)
  lastBigGap: (gap: number, rank: number) => [
    `Letzter Platz, ${gap} Pins hinter dem Ersten. Das war weniger Wettbewerb und mehr Zuschauer mit Kugel.`,
    `${gap} Pins Rückstand zum Tagesboss. Das ist kein Abstand, das ist eine eigene Postleitzahl.`,
    `Schlusslicht mit ${gap} Pins Rückstand. Immerhin: irgendjemand muss die anderen besser aussehen lassen.`,
    `Platz ${rank + 1} mit ${gap} Pins Distanz zur Spitze. Das ist keine Niederlage, das ist eine andere Sportart.`,
    `${gap} Pins hinten. Du hast heute nicht verloren, du hast an einem anderen Wettbewerb teilgenommen.`,
    `${gap} Pins Rückstand. Dein Score liegt so tief, der bräuchte eine Bergungsmannschaft.`,
  ] as const,
  // Last place with noticeable gap (15-29 pins behind)
  lastNoticeableGap: (gap: number, rank: number) => [
    `Letzter Platz, ${gap} Pins hinter der Spitze. Heute war jemand der Grund, warum die anderen sich besser fühlen.`,
    `${gap} Pins Rückstand. Das tut weh, aber Charakter ist wichtiger als Punkte. Sagen zumindest Verlierer.`,
    `Schlusslicht mit Abstand. ${gap} Pins sind kein Pech, da fehlt auch ein bisschen Substanz.`,
    `Platz ${rank + 1}. ${gap} Pins hinter dem Ersten — heute war eher Teilnahme als Teilhabe.`,
  ] as const,
  // Close to leader (0-5 pins behind)
  closeToLeader: (gap: number, rank: number) => [
    `Nur ${gap} Pins hinter Platz 1. So nah dran und trotzdem daneben — das ist fast schlimmer als klar verlieren.`,
    `${gap} Pins fehlen zur Krone. Ein Spare mehr und die Geschichte wäre anders.`,
    `Platz ${rank + 1}, aber nur ${gap} Pins zurück. Knapper geht kaum. Der Schmerz auch nicht.`,
    `Hauchdünn hinter dem Ersten. ${gap} Pins — das sind ein bis zwei bessere Würfe. Ärgerlich.`,
    `${gap} Pins. So stirbt Hoffnung: langsam, knapp, und vor Publikum.`,
  ] as const,
  // In striking distance (6-15 pins behind)
  strikingDistance: (gap: number, rank: number) => [
    `${gap} Pins hinter der Spitze. Nah genug zum Ärgern, zu weit zum Feiern.`,
    `Platz ${rank + 1} mit ${gap} Pins Rückstand. Im Rennen, aber nicht auf dem Podest.`,
    `${gap} Pins fehlen. Das ist noch Schlagdistanz, aber du musst auch zuschlagen.`,
  ] as const,
  // Above own average
  aboveAvg: (delta: number) => [
    `+${delta} über eigenem Ø. Heute wurde die Normalform kurz aus dem Fenster geworfen.`,
    `+${delta} zum eigenen Schnitt. Wer auch immer da gespielt hat: bitte öfter einladen.`,
    `${delta} Pins über Normalform. Verdächtig gut, aber wir lassen es durchgehen.`,
    `+${delta} über Schnitt. Formkurve zeigt steil nach oben. Oder es war einfach ein guter Tag mit viel Glück.`,
  ] as const,
  // Below own average
  belowAvg: (delta: number) => [
    `${delta} unter eigenem Ø. Heute war wohl eher Charaktertest als Sport.`,
    `${delta} zum eigenen Schnitt. Die Form war da, nur offenbar an einem anderen Ort.`,
    `Unter Normalform. Das war kein Abend, das war eine Entschuldigung mit Schuhen.`,
    `${delta} unter dem eigenen Schnitt. Irgendwas lief schief. Oder alles.`,
  ] as const,
  // High open frame rate
  manyOpen: [
    'Viele offene Frames. Die Pins wurden nicht abgeräumt, sie wurden stehengelassen wie unbeantwortete Nachrichten.',
    'Offene Frames ohne Ende. Sehr großzügiger Umgang mit fremden Siegchancen.',
    'Da blieb zu viel stehen. Die Pins hatten heute Mietvertrag.',
    'So viele offene Frames, dass man fragt: hast du den zweiten Wurf absichtlich ausgelassen?',
  ],
  // Low open frame rate
  fewOpen: [
    'Sauberer Abend. Wenig Geschenke, wenig Mitleid.',
    'Wenig offene Frames. Sehr kontrolliert, fast schon unsympathisch.',
    'Aufgeräumt gespielt. Die Konkurrenz hasst diesen Trick.',
    'Clean Game. Fast alles abgeräumt, fast alles richtig gemacht. Das "fast" ärgert trotzdem.',
  ],
  // Default / average
  neutral: [
    'Unauffälliger Mischabend: nicht legendär, nicht gerichtsverwertbar.',
    'Solider Mischmasch. Kein Denkmal, kein Tatort.',
    'Heute irgendwo zwischen Können und Kugelroulette.',
    'Weder Held noch Opfer. Einfach dabei. Das ist auch was. Irgendwie.',
  ],
} as const;
