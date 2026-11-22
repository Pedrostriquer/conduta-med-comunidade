/* Quais peças do BodyParts3D entram em cada arquivo de modelo do treino (app/public/treino/<id>.bin).
   Os nomes são os da lista oficial em inglês (parts_list_e.txt). Sem lado, vale o direito; "left ..." é só contexto.
   Uma peça pode juntar várias malhas (ex.: as três partes do deltoide). `corta`: a peça é contexto e é cortada perto das outras. */

const ord = ["first", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth", "ninth", "tenth", "eleventh", "twelfth"];
const seq = (n, f, from = 0) => Object.fromEntries(Array.from({ length: n }, (_, i) => f(i + from)));
const cerv = seq(5, (i) => [`c${i + 3}`, `${ord[i + 2]} cervical vertebra`]);
const tor = seq(12, (i) => [`t${i + 1}`, `${ord[i]} thoracic vertebra`]);
const lomb = seq(5, (i) => [`l${i + 1}`, `${ord[i]} lumbar vertebra`]);
const costD = seq(12, (i) => [`costela${i + 1}`, `right ${ord[i]} rib`]);
const costE = seq(12, (i) => [`costela-e${i + 1}`, `left ${ord[i]} rib`]);
const cranio = {
  frontal: "frontal bone", parietal: "parietal bone", occipital: "occipital bone", temporal: "temporal bone", esfenoide: "sphenoid bone", etmoide: "ethmoid",
  maxila: "maxilla", mandibula: "mandible", zigomatico: "zygomatic bone", nasal: "nasal bone", lacrimal: "lacrimal bone", vomer: "vomer", palatino: "palatine bone",
  concha: "inferior nasal concha", hioide: "hyoid bone",
  "parietal-e": "left parietal bone", "temporal-e": "left temporal bone", "maxila-e": "left maxilla", "zigomatico-e": "left zygomatic bone", "nasal-e": "left nasal bone",
  "lacrimal-e": "left lacrimal bone", "palatino-e": "left palatine bone", "concha-e": "left inferior nasal concha",
};
const carpo = { escafoide: "scaphoid", semilunar: "lunate", piramidal: "triquetral", pisiforme: "pisiform", trapezio: "trapezium", trapezoide: "trapezoid", capitato: "capitate", hamato: "hamate" };
const dedos = ["thumb", "index finger", "middle finger", "ring finger", "little finger"];
const mao = {
  metacarpos: ord.slice(0, 5).map((o) => `${o} metacarpal bone`),
  "falanges-p": dedos.map((d) => `proximal phalanx of ${d}`), "falanges-m": dedos.slice(1).map((d) => `middle phalanx of ${d}`), "falanges-d": dedos.map((d) => `distal phalanx of ${d}`),
};
const artelhos = ["big toe", "second toe", "third toe", "fourth toe", "little toe"];
const tarso = { talus: "talus", calcaneo: "calcaneus", navicular: "navicular bone of foot", cuboide: "cuboid bone", "cuneiforme-medial": "medial cuneiform bone", "cuneiforme-intermedio": "intermediate cuneiform bone", "cuneiforme-lateral": "lateral cuneiform bone" };
const antepe = {
  metatarsos: ord.slice(0, 5).map((o) => `${o} metatarsal bone`),
  "falanges-pe": [...artelhos.map((d) => `proximal phalanx of ${d}`), ...artelhos.slice(1).map((d) => `middle phalanx of ${d}`), ...artelhos.map((d) => `distal phalanx of ${d}`)],
};
const juntas = (o) => Object.values(o).flat();

export const MODELOS = {
  /* ---------------- ossos ---------------- */
  cranio: { ossos: { ...cranio, atlas: "atlas", axis: "axis" } },
  coluna: { ossos: { atlas: "atlas", axis: "axis", ...cerv, ...tor, ...lomb, sacro: "sacrum", disco: "intervertebral disk of third lumbar vertebra", occipital: "occipital bone", quadril: "hip bone", "quadril-e": "left hip bone" } },
  torax: {
    ossos: { manubrio: "manubrium", "corpo-esterno": "body of sternum", xifoide: "xiphoid process", ...costD, ...costE, ...tor,
      cartilagens: ord.slice(0, 7).map((o) => `right ${o} costal cartilage`), clavicula: "clavicle", "clavicula-e": "left clavicle" },
  },
  "membro-superior": { ossos: { clavicula: "clavicle", escapula: "scapula", umero: "humerus", radio: "radius", ulna: "ulna", carpo: juntas(carpo), ...mao, manubrio: "manubrium", costela1: "right first rib" } },
  mao: { base: "mao", ossos: { ...carpo, ...mao, radio: { n: "radius", corta: 60 }, ulna: { n: "ulna", corta: 60 } } },
  "membro-inferior": { ossos: { quadril: "hip bone", sacro: "sacrum", femur: "femur", patela: "patella", tibia: "tibia", fibula: "fibula", pe: [...juntas(tarso), ...juntas(antepe)], "quadril-e": "left hip bone", l5: "fifth lumbar vertebra" } },
  pe: { ossos: { ...tarso, ...antepe, tibia: { n: "tibia", corta: 70 }, fibula: { n: "fibula", corta: 70 } } },
  // mão e pé com cada osso separado, para os níveis "um a um"
  "mao-ossos": { base: "mao", ossos: { ...carpo, ...seq(5, (i) => [`metacarpo-${i + 1}`, `${ord[i]} metacarpal bone`]), ...seq(5, (i) => [`fp-${i + 1}`, `proximal phalanx of ${dedos[i]}`]),
    ...seq(4, (i) => [`fm-${i + 2}`, `middle phalanx of ${dedos[i + 1]}`]), ...seq(5, (i) => [`fd-${i + 1}`, `distal phalanx of ${dedos[i]}`]), radio: { n: "radius", corta: 60 }, ulna: { n: "ulna", corta: 60 } } },
  "pe-ossos": { ossos: { ...tarso, ...seq(5, (i) => [`metatarso-${i + 1}`, `${ord[i]} metatarsal bone`]), ...seq(5, (i) => [`pfp-${i + 1}`, `proximal phalanx of ${artelhos[i]}`]),
    ...seq(4, (i) => [`pfm-${i + 2}`, `middle phalanx of ${artelhos[i + 1]}`]), ...seq(5, (i) => [`pfd-${i + 1}`, `distal phalanx of ${artelhos[i]}`]), sesamoide: "sesamoid bone of foot",
    tibia: { n: "tibia", corta: 70 }, fibula: { n: "fibula", corta: 70 } } },

  /* ---------------- corpo inteiro, leve: para escolher a região e para o Explorar ----------------
     Uma peça por zona do corpo; os membros do lado esquerdo são o espelho do direito. `pele` é só o contorno. */
  corpo: {
    tOsso: 4200,
    ossos: {
      cabeca: [...Object.values(cranio)],
      coluna: ["atlas", "axis", ...Object.values(cerv), ...Object.values(tor), ...Object.values(lomb), "sacrum"],
      torax: ["manubrium", "body of sternum", "xiphoid process", ...Object.values(costD), ...Object.values(costE)],
      ombro: { n: ["clavicle", "scapula", "humerus"], espelha: true },
      antebraco: { n: ["radius", "ulna"], espelha: true },
      mao: { n: [...juntas(carpo), ...juntas(mao)], espelha: true, t: 2600 },
      quadril: ["hip bone", "left hip bone"],
      coxa: { n: ["femur", "patella"], espelha: true },
      perna: { n: ["tibia", "fibula"], espelha: true },
      pe: { n: [...juntas(tarso), ...juntas(antepe)], espelha: true, t: 2600 },
    },
    pele: { pele: { n: "skin", t: 7000 } },
  },

  /* ---------------- órgãos, para a camada do Explorar ---------------- */
  orgaos: {
    tOrgao: 1700,
    orgaos: {
      coracao: "wall of heart", "pulmao-d-superior": "upper lobe of right lung", "pulmao-d-medio": "middle lobe of lung", "pulmao-d-inferior": "lower lobe of right lung",
      "pulmao-e-superior": "upper lobe of left lung", "pulmao-e-inferior": "lower lobe of left lung", traqueia: "trachea", bronquios: "bronchus", esofago: "esophagus",
      figado: "liver", "vesicula-biliar": "gallbladder", estomago: "stomach", baco: "spleen", pancreas: "pancreas, nsn", duodeno: "duodenum", jejuno: "jejunum", ileo: "ileum",
      colon: "colon, nsn", apendice: "appendix", reto: "rectum", "rim-d": "kidney", "rim-e": "left kidney", "suprarrenal-d": "adrenal gland", "ureter-d": "ureter", bexiga: "urinary bladder",
      "aorta-ascendente": "ascending aorta", "arco-aorta": "arch of aorta", "aorta-descendente": "descending aorta", "veia-cava-superior": "superior vena cava", "veia-cava-inferior": "inferior vena cava",
      "arteria-pulmonar": "pulmonary artery", timo: "lobe of thymus", "cartilagem-tireoidea": "thyroid cartilage", cerebelo: "cerebellum", ponte: "pons", bulbo: "medulla oblongata",
      mesencefalo: "midbrain, nsn", "olho-d": "eyeball", diafragma: "diaphragm",
    },
  },

  /* ---------------- músculos (com os ossos por baixo) ---------------- */
  "m-cabeca": {
    ossos: { ...cranio, atlas: "atlas", axis: "axis", ...cerv, clavicula: "clavicle", manubrio: "manubrium", costela1: "right first rib", costela2: "right second rib", escapula: "scapula" },
    musculos: {
      masseter: ["deep part of masseter", "superficial part of masseter"], temporal: "temporalis", bucinador: "buccinator", "orbicular-boca": "orbicularis oris",
      "orbicular-olho": ["orbital part of orbicularis oculi", "palpebral part of orbicularis oculi"], occipitofrontal: ["frontalis", "occipitalis"],
      ecm: "sternocleidomastoid", platisma: "platysma", "zigomatico-maior": "zygomaticus major",
      "pterigoideo-medial": "medial pterygoid", "pterigoideo-lateral": ["upper head of lateral pterygoid", "lower head of lateral pterygoid"],
      digastrico: ["anterior belly of digastric", "posterior belly of digastric"], "milo-hioideo": "mylohyoid", "esterno-hioideo": "sternohyoid", "omo-hioideo": "omohyoid",
      "escaleno-anterior": "scalenus anterior", "escaleno-medio": "scalenus medius",
    },
  },
  "m-ombro": {
    ossos: { clavicula: "clavicle", escapula: "scapula", umero: "humerus", radio: "radius", ulna: "ulna", manubrio: "manubrium", costela1: "right first rib", costela2: "right second rib", costela3: "right third rib" },
    musculos: {
      deltoide: ["clavicular part of deltoid", "acromial part of deltoid", "spinal part of deltoid"], supraespinal: "supraspinatus", infraespinal: "infraspinatus muscle",
      "redondo-menor": "teres minor", "redondo-maior": "teres major", subescapular: "subscapularis", biceps: ["long head of biceps brachii", "short head of biceps brachii"],
      braquial: "brachialis", coracobraquial: "coracobrachialis", triceps: ["long head of triceps brachii", "lateral head of triceps brachii", "medial head of triceps brachii"],
    },
  },
  "m-antebraco": {
    ossos: { umero: "humerus", radio: "radius", ulna: "ulna", mao: [...juntas(carpo), ...juntas(mao)] },
    musculos: {
      "pronador-redondo": ["humeral head of pronator teres", "ulnar head of pronator teres"], "flexor-radial-carpo": "flexor carpi radialis", "palmar-longo": "palmaris longus",
      "flexor-ulnar-carpo": ["humeral head of flexor carpi ulnaris", "ulnar head of flexor carpi ulnaris"],
      "flexor-superficial-dedos": ["humeroulnar head of flexor digitorum superficialis", "radial head of flexor digitorum superficialis"],
      "flexor-profundo-dedos": "flexor digitorum profundus", "flexor-longo-polegar": "flexor pollicis longus", "pronador-quadrado": "pronator quadratus",
      braquiorradial: "brachioradialis", "extensor-radial-longo": "extensor carpi radialis longus", "extensor-radial-curto": "extensor carpi radialis brevis",
      "extensor-dedos": "extensor digitorum", "extensor-dedo-minimo": "extensor digiti minimi",
      "extensor-ulnar-carpo": ["humeral head of extensor carpi ulnaris", "ulnar head of extensor carpi ulnaris"], supinador: "supinator",
      "extensor-longo-polegar": "extensor pollicis longus", anconeo: "anconeus",
    },
  },
  "m-tronco": {
    tOsso: 420,
    ossos: { manubrio: "manubrium", "corpo-esterno": "body of sternum", xifoide: "xiphoid process", ...costD, ...costE, ...tor, ...lomb, sacro: "sacrum", quadril: "hip bone", "quadril-e": "left hip bone",
      clavicula: "clavicle", escapula: "scapula", umero: "humerus" },
    musculos: {
      "peitoral-maior": ["clavicular part of pectoralis major", "sternocostal part of pectoralis major", "abdominal part of pectoralis major"], "peitoral-menor": "pectoralis minor",
      "serratil-anterior": "serratus anterior", "reto-abdome": "rectus abdominis", "obliquo-externo": "external oblique", "obliquo-interno": "internal oblique",
      "transverso-abdome": "transversus abdominis", diafragma: "diaphragm",
    },
  },
  "m-dorso": {
    tOsso: 420,
    ossos: { occipital: "occipital bone", atlas: "atlas", axis: "axis", ...cerv, ...tor, ...lomb, sacro: "sacrum", ...costD, ...costE, escapula: "scapula", clavicula: "clavicle", umero: "humerus", quadril: "hip bone", "quadril-e": "left hip bone" },
    musculos: {
      trapezio: ["descending part of trapezius", "transverse part of trapezius", "ascending part of trapezius"], latissimo: "latissimus dorsi", "levantador-escapula": "levator scapulae",
      "romboide-maior": "rhomboid major", "romboide-menor": "rhomboid minor", iliocostal: ["iliocostalis lumborum", "iliocostalis thoracis", "iliocostalis cervicis"],
      longuissimo: ["longissimus thoracis", "longissimus cervicis", "longissimus capitis"], espinal: ["spinalis thoracis", "spinalis cervicis"],
      "esplenio-cabeca": "splenius capitis", "quadrado-lombo": "quadratus lumborum",
    },
  },
  "m-quadril": {
    ossos: { quadril: "hip bone", "quadril-e": "left hip bone", sacro: "sacrum", ...lomb, t12: "twelfth thoracic vertebra", femur: "femur" },
    musculos: { "gluteo-maximo": "gluteus maximus", "gluteo-medio": "gluteus medius", "gluteo-minimo": "gluteus minimus", piriforme: "piriformis", "obturador-interno": "obturator internus",
      "quadrado-femoral": "quadratus femoris", "psoas-maior": "psoas major", iliaco: "iliacus" },
  },
  "m-coxa": {
    ossos: { quadril: "hip bone", sacro: "sacrum", femur: "femur", patela: "patella", tibia: "tibia", fibula: "fibula" },
    musculos: { "reto-femoral": "rectus femoris", "vasto-lateral": "vastus lateralis", "vasto-medial": "vastus medialis", "vasto-intermedio": "vastus intermedius", sartorio: "sartorius",
      gracil: "gracilis", pectineo: "pectineus", "biceps-femoral": ["long head of biceps femoris", "short head of biceps femoris"], semitendineo: "semitendinosus", semimembranaceo: "semimembranosus" },
  },
  "m-perna": {
    ossos: { femur: "femur", patela: "patella", tibia: "tibia", fibula: "fibula", pe: [...juntas(tarso), ...juntas(antepe)] },
    musculos: { "tibial-anterior": "tibialis anterior", "extensor-longo-dedos": "extensor digitorum longus", "extensor-longo-halux": "extensor hallucis longus", "fibular-longo": "fibularis longus",
      "fibular-curto": "fibularis brevis", gastrocnemio: ["medial head of gastrocnemius", "lateral head of gastrocnemius"], soleo: "soleus", popliteo: "popliteus",
      "tibial-posterior": "tibialis posterior", "flexor-longo-halux": "flexor hallucis longus" },
  },
};
