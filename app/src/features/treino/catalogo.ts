/* O conteúdo do treino: ossos e músculos por região (com níveis de 6 a 10 itens) e ECG em quatro níveis.
   Nomes em português do Brasil (Terminologia Anatômica); sinônimos e nomes antigos são aceitos na resposta.
   RASCUNHO: os textos de apoio e as pistas ainda não foram conferidos por médico. */
import type { Item } from "./motor";
import type { Vista } from "./cena3d";

export type Modo = "ossos" | "musculos" | "ecg";
export type ItemDef = Item & {
  /** peças do modelo que acendem (padrão: a de mesmo id) */
  pecas?: string[];
  vista?: Vista;
  /** nome(s) da malha no BodyParts3D: o script de modelos monta o arquivo do nível a partir daqui */
  en?: string | string[];
};
export type Conjunto = {
  id: string; modo: Modo;
  /** a região a que o nível pertence ("ossos-cranio"): é a chave do progresso, comum a todos os níveis dela */
  grupo: string;
  /** true: o que a faculdade e as provas cobram; false: o resto, para quem quer o completo */
  principal: boolean;
  /** ossos de contexto (um modelo de scripts/treino_pecas.mjs); com ele, o arquivo do nível é gerado a partir de `en` */
  contexto?: string;
  /** "Crânio e face" */
  regiao: string;
  /** "Neurocrânio": o nome do nível dentro da região; vazio quando a região tem um nível só */
  nivel: string;
  /** arquivo em /treino/<modelo>.bin (ossos e músculos) */
  modelo?: string;
  vista?: Vista;
  /** legenda da miniatura */
  legenda?: string;
  itens: ItemDef[];
};

type Extra = { ac?: string[]; p?: string[]; v?: Vista };
type Bruto = Omit<Conjunto, "grupo" | "principal"> & { principal?: boolean };
/** id, nome, apoio (rodada 1 e explicação do erro), pista (rodada 2) */
const it = (id: string, nome: string, apoio: string, pista: string, x: Extra = {}): ItemDef =>
  ({ id, nome, apoio, pista, onde: apoio.split(" · ")[0], ...(x.ac ? { aceitos: x.ac } : {}), ...(x.p ? { pecas: x.p } : {}), ...(x.v ? { vista: x.v } : {}) });
const faixa = (pre: string, de: number, ate: number) => Array.from({ length: ate - de + 1 }, (_, i) => pre + (de + i));

/* ============================== OSSOS ============================== */
const OSSOS: Bruto[] = [
  { id: "ossos-cranio-1", modo: "ossos", regiao: "Crânio e face", nivel: "Neurocrânio", modelo: "cranio", vista: [-0.75, 0.1], legenda: "crânio · de frente", itens: [
    it("frontal", "frontal", "forma a testa e o teto das órbitas", "testa · teto das órbitas"),
    it("parietal", "parietal", "teto e lado do crânio · par", "entre o frontal e o occipital", { v: [-1.2, 0.45] }),
    it("occipital", "occipital", "parte de trás e base do crânio", "tem o forame magno", { v: [Math.PI + 0.5, -0.1] }),
    it("temporal", "temporal", "lado do crânio, onde fica a orelha · par", "processo mastoide e meato acústico", { v: "l" }),
    it("esfenoide", "esfenoide", "no meio da base do crânio · em forma de borboleta", "tem a sela turca", { ac: ["esfenóide"], v: "l" }),
    it("etmoide", "etmoide", "entre as órbitas, no teto do nariz", "tem a lâmina cribriforme", { ac: ["etmóide"] }),
  ] },
  { id: "ossos-cranio-2", modo: "ossos", regiao: "Crânio e face", nivel: "Face", modelo: "cranio", vista: [-0.75, 0.1], legenda: "crânio · de frente", itens: [
    it("maxila", "maxila", "arcada dentária de cima · par", "palato duro e assoalho da órbita", { ac: ["maxilar"] }),
    it("mandibula", "mandíbula", "arcada dentária de baixo · o único osso móvel do crânio", "articula com o temporal (ATM)"),
    it("zigomatico", "zigomático", "maçã do rosto · par", "forma o arco zigomático com o temporal", { ac: ["malar"] }),
    it("nasal", "nasal", "dorso do nariz · par", "ponte do nariz"),
    it("lacrimal", "lacrimal", "parede medial da órbita · par", "o menor osso da face"),
    it("vomer", "vômer", "parte de trás e de baixo do septo nasal", "ímpar · septo nasal, com o etmoide"),
    it("palatino", "palatino", "parte de trás do palato duro · par", "em L, atrás da maxila", { v: [Math.PI - 0.5, -0.5] }),
    it("concha", "concha nasal inferior", "parede lateral da cavidade nasal · par", "a única concha que é um osso separado", { ac: ["corneto inferior", "concha inferior"] }),
    it("hioide", "hioide", "no pescoço, abaixo da mandíbula", "não articula com nenhum outro osso", { ac: ["hióide", "osso hioide"] }),
  ] },
  { id: "ossos-coluna", modo: "ossos", regiao: "Coluna vertebral", nivel: "", modelo: "coluna", vista: "l", legenda: "coluna · de lado", itens: [
    it("atlas", "atlas", "primeira vértebra cervical (C1) · sem corpo", "sustenta o crânio", { ac: ["c1", "primeira vertebra cervical"], v: [-0.9, 0.5] }),
    it("axis", "áxis", "segunda vértebra cervical (C2)", "tem o dente (processo odontoide)", { ac: ["c2", "segunda vertebra cervical"], v: [-0.9, 0.3] }),
    it("cervical", "vértebra cervical", "região do pescoço · sete vértebras", "tem forame no processo transverso", { ac: ["cervical", "vertebra cervical tipica"], p: ["c4"] }),
    it("proeminente", "vértebra proeminente", "sétima cervical (C7)", "processo espinhoso longo, fácil de palpar", { ac: ["c7", "setima vertebra cervical", "vertebra proeminente"], p: ["c7"] }),
    it("toracica", "vértebra torácica", "região do tórax · doze vértebras", "tem fóveas para as costelas", { ac: ["toracica", "vertebra dorsal"], p: ["t6"] }),
    it("lombar", "vértebra lombar", "região lombar · cinco vértebras", "corpo grande, sem fóveas costais", { ac: ["lombar"], p: ["l3"] }),
    it("sacro", "sacro", "cinco vértebras fundidas", "articula com os ossos do quadril", { v: [-0.6, 0.1] }),
    it("disco", "disco intervertebral", "entre dois corpos vertebrais", "anel fibroso e núcleo pulposo", { ac: ["disco"] }),
  ] },
  { id: "ossos-torax", modo: "ossos", regiao: "Tórax", nivel: "", modelo: "torax", vista: "a", legenda: "tórax · de frente", itens: [
    it("manubrio", "manúbrio", "parte de cima do esterno", "articula com a clavícula e a 1ª costela", { ac: ["manubrio do esterno"] }),
    it("corpo-esterno", "corpo do esterno", "parte do meio do esterno", "une-se ao manúbrio no ângulo do esterno", { ac: ["corpo esternal"] }),
    it("xifoide", "processo xifoide", "ponta de baixo do esterno", "cartilagem que ossifica com a idade", { ac: ["xifoide", "apendice xifoide", "processo xifóide"] }),
    it("costela1", "primeira costela", "a mais curta e mais curva", "passa por baixo da clavícula", { ac: ["1 costela", "costela 1", "1a costela"], v: [-0.3, 0.75] }),
    it("verdadeiras", "costelas verdadeiras", "da 1ª à 7ª · cartilagem própria até o esterno", "ligam-se direto ao esterno", { ac: ["costela verdadeira", "costelas vertebroesternais"], p: faixa("costela", 1, 7) }),
    it("falsas", "costelas falsas", "da 8ª à 12ª · não se ligam direto ao esterno", "8ª a 12ª", { ac: ["costela falsa"], p: faixa("costela", 8, 12) }),
    it("flutuantes", "costelas flutuantes", "11ª e 12ª · pontas livres", "não chegam à frente do tórax", { ac: ["costela flutuante"], p: ["costela11", "costela12"], v: [-1.0, 0.1] }),
    it("cartilagens", "cartilagens costais", "ligam as costelas ao esterno", "dão elasticidade à caixa torácica", { ac: ["cartilagem costal"] }),
  ] },
  { id: "ossos-ms-1", modo: "ossos", regiao: "Membro superior", nivel: "Ombro, braço e mão", modelo: "membro-superior", vista: "a", legenda: "membro superior direito · de frente", itens: [
    it("clavicula", "clavícula", "liga o esterno à escápula", "em S · o osso que mais fratura", { v: [-0.3, 0.4] }),
    it("escapula", "escápula", "osso triangular na parte de trás do tórax", "acrômio, espinha e cavidade glenoidal", { ac: ["omoplata"], v: "p" }),
    it("umero", "úmero", "osso do braço", "a cabeça articula com a escápula"),
    it("radio", "rádio", "antebraço, lado do polegar", "a cabeça gira na pronação e na supinação"),
    it("ulna", "ulna", "antebraço, lado do dedo mínimo", "tem o olécrano", { ac: ["cubito"], v: "p" }),
    it("carpo", "ossos do carpo", "oito ossos do punho, em duas fileiras", "entre o antebraço e os metacarpos", { ac: ["carpo", "carpais", "ossos carpais"] }),
    it("metacarpos", "metacarpos", "cinco ossos da palma", "entre o carpo e as falanges", { ac: ["metacarpais", "ossos metacarpais", "metacarpo"] }),
    it("falanges-p", "falanges proximais", "a primeira falange de cada dedo", "articulam com os metacarpos", { ac: ["falange proximal"] }),
    it("falanges-m", "falanges médias", "a falange do meio · o polegar não tem", "quatro por mão", { ac: ["falange media"] }),
    it("falanges-d", "falanges distais", "a ponta dos dedos", "sustentam a unha", { ac: ["falange distal"] }),
  ] },
  { id: "ossos-ms-2", modo: "ossos", regiao: "Membro superior", nivel: "Carpo", modelo: "mao", vista: "a", legenda: "mão direita · palma", itens: [
    it("escafoide", "escafoide", "fileira proximal, lado do polegar · em forma de barco", "barco · o que mais fratura no carpo", { ac: ["navicular da mão", "escafóide"] }),
    it("semilunar", "semilunar", "fileira proximal, entre o escafoide e o piramidal · também lunato", "meia-lua · o que mais luxa", { ac: ["lunato", "lunar"] }),
    it("piramidal", "piramidal", "fileira proximal, lado do dedo mínimo · também tríquetro", "pirâmide · fica atrás do pisiforme", { ac: ["triquetro", "triquetral"] }),
    it("pisiforme", "pisiforme", "na frente do piramidal, na palma · em forma de ervilha", "ervilha · dentro do tendão do flexor ulnar do carpo"),
    it("trapezio", "trapézio", "fileira distal, na base do polegar", "articulação em sela com o 1º metacarpo"),
    it("trapezoide", "trapezoide", "fileira distal, na base do indicador", "o menor da fileira distal · 2º metacarpo", { ac: ["trapezóide"] }),
    it("capitato", "capitato", "centro do carpo, na base do dedo médio · o maior", "o maior do carpo · 3º metacarpo", { ac: ["grande osso"] }),
    it("hamato", "hamato", "fileira distal, lado do dedo mínimo · tem um gancho", "gancho (hâmulo) · 4º e 5º metacarpos", { ac: ["unciforme"] }),
  ] },
  { id: "ossos-mi-1", modo: "ossos", regiao: "Membro inferior", nivel: "Pelve, coxa e perna", modelo: "membro-inferior", vista: "a", legenda: "membro inferior direito · de frente", itens: [
    it("quadril", "osso do quadril", "ílio, ísquio e púbis fundidos", "tem o acetábulo", { ac: ["quadril", "osso coxal", "coxal", "iliaco", "osso iliaco"] }),
    it("sacro", "sacro", "fecha a pelve por trás", "entre os dois ossos do quadril"),
    it("femur", "fêmur", "osso da coxa · o mais longo do corpo", "a cabeça encaixa no acetábulo"),
    it("patela", "patela", "na frente do joelho", "sesamoide, dentro do tendão do quadríceps", { ac: ["rotula"] }),
    it("tibia", "tíbia", "perna, lado medial · sustenta o peso", "tem o maléolo medial"),
    it("fibula", "fíbula", "perna, lado lateral · fina", "tem o maléolo lateral", { ac: ["peronio"], v: "l" }),
  ] },
  { id: "ossos-mi-2", modo: "ossos", regiao: "Membro inferior", nivel: "Pé", modelo: "pe", vista: [-0.9, 0.75], legenda: "pé direito · de cima", itens: [
    it("talus", "tálus", "encaixa entre a tíbia e a fíbula", "nenhum músculo se insere nele", { ac: ["astragalo"] }),
    it("calcaneo", "calcâneo", "osso do calcanhar · o maior do tarso", "recebe o tendão calcâneo", { v: [-1.9, 0.25] }),
    it("navicular", "navicular", "lado medial, na frente do tálus", "em forma de barco", { v: [0.6, 0.7] }),
    it("cuboide", "cuboide", "lado lateral, na frente do calcâneo", "articula com o 4º e o 5º metatarsos", { ac: ["cubóide"] }),
    it("cuneiforme-medial", "cuneiforme medial", "na base do 1º metatarso", "o maior dos três cuneiformes", { v: [0.5, 0.75] }),
    it("cuneiforme-intermedio", "cuneiforme intermédio", "na base do 2º metatarso", "o menor dos três cuneiformes", { ac: ["cuneiforme intermediario", "cuneiforme medio"], v: [-0.2, 1.0] }),
    it("cuneiforme-lateral", "cuneiforme lateral", "na base do 3º metatarso", "entre o intermédio e o cuboide", { v: [-0.6, 1.0] }),
    it("metatarsos", "metatarsos", "cinco ossos do meio do pé", "entre o tarso e as falanges", { ac: ["metatarsais", "ossos metatarsais", "metatarso"] }),
    it("falanges-pe", "falanges", "ossos dos dedos do pé", "o hálux tem só duas", { ac: ["falanges do pe", "falange"] }),
  ] },
];

/* ============================== MÚSCULOS ============================== */
const MUSCULOS: Bruto[] = [
  { id: "musculos-cabeca-1", modo: "musculos", regiao: "Cabeça e pescoço", nivel: "Mímica e mastigação", modelo: "m-cabeca", vista: [-0.8, 0.05], legenda: "cabeça e pescoço", itens: [
    it("masseter", "masseter", "eleva a mandíbula · mastigação", "do arco zigomático ao ângulo da mandíbula · trigêmeo (V3)", { v: "l" }),
    it("temporal", "temporal", "eleva e retrai a mandíbula", "em leque, na fossa temporal · trigêmeo (V3)", { ac: ["musculo temporal"], v: "l" }),
    it("bucinador", "bucinador", "comprime a bochecha · soprar e sugar", "nervo facial", { v: "l" }),
    it("orbicular-boca", "orbicular da boca", "fecha os lábios", "esfíncter da boca · nervo facial", { ac: ["orbicular dos labios"], v: "a" }),
    it("orbicular-olho", "orbicular do olho", "fecha as pálpebras", "nervo facial · sem ele o olho não fecha", { ac: ["orbicular dos olhos"], v: "a" }),
    it("occipitofrontal", "occipitofrontal", "ergue as sobrancelhas e enruga a testa", "dois ventres unidos pela aponeurose epicrânica", { ac: ["frontal", "occipito-frontal", "epicranio"], v: "l" }),
    it("ecm", "esternocleidomastóideo", "gira a cabeça para o lado oposto", "nervo acessório (XI)", { ac: ["ecm", "esternocleidomastoide", "esternocleido"] }),
    it("platisma", "platisma", "tensiona a pele do pescoço", "superficial · nervo facial"),
    it("zigomatico-maior", "zigomático maior", "puxa o canto da boca para cima · sorriso", "nervo facial"),
  ] },
  { id: "musculos-cabeca-2", modo: "musculos", regiao: "Cabeça e pescoço", nivel: "Profundos e pescoço", modelo: "m-cabeca", vista: [-0.8, 0.05], legenda: "cabeça e pescoço", itens: [
    it("pterigoideo-medial", "pterigóideo medial", "eleva a mandíbula", "por dentro do ramo da mandíbula · trigêmeo (V3)", { ac: ["pterigoide medial"], v: [Math.PI - 0.6, -0.2] }),
    it("pterigoideo-lateral", "pterigóideo lateral", "protrai e abre a mandíbula", "o único da mastigação que abre a boca", { ac: ["pterigoide lateral"], v: "l" }),
    it("digastrico", "digástrico", "abaixa a mandíbula e eleva o hioide", "dois ventres: V3 no anterior, facial no posterior", { v: [-1.1, -0.35] }),
    it("milo-hioideo", "milo-hióideo", "forma o assoalho da boca", "eleva o hioide na deglutição", { ac: ["milohioideo", "milo hioideo"], v: [-0.5, -0.8] }),
    it("esterno-hioideo", "esterno-hióideo", "abaixa o hioide", "infra-hióideo · alça cervical", { ac: ["esternohioideo", "esterno hioideo"], v: "a" }),
    it("omo-hioideo", "omo-hióideo", "abaixa o hioide", "dois ventres, da escápula ao hioide", { ac: ["omohioideo", "omo hioideo"] }),
    it("escaleno-anterior", "escaleno anterior", "eleva a 1ª costela e flete o pescoço", "o plexo braquial passa atrás dele", {}),
    it("escaleno-medio", "escaleno médio", "eleva a 1ª costela", "o plexo braquial passa entre ele e o anterior", { v: "l" }),
  ] },
  { id: "musculos-ombro", modo: "musculos", regiao: "Ombro e braço", nivel: "", modelo: "m-ombro", vista: "a", legenda: "ombro e braço direitos", itens: [
    it("deltoide", "deltoide", "abduz o braço", "nervo axilar", { ac: ["deltóide"], v: "l" }),
    it("supraespinal", "supraespinal", "inicia a abdução do braço", "manguito rotador · o tendão que mais rompe", { ac: ["supraespinhal", "supraespinhoso", "supra-espinal", "supra-espinhal"], v: [Math.PI + 0.2, 0.5] }),
    it("infraespinal", "infraespinal", "rotação lateral do braço", "manguito rotador · nervo supraescapular", { ac: ["infraespinhal", "infraespinhoso", "infra-espinal", "infra-espinhal"], v: "p" }),
    it("redondo-menor", "redondo menor", "rotação lateral do braço", "manguito rotador · nervo axilar", { v: "p" }),
    it("redondo-maior", "redondo maior", "adução e rotação medial do braço", "não faz parte do manguito rotador", { v: "p" }),
    it("subescapular", "subescapular", "rotação medial do braço", "manguito rotador · face da frente da escápula"),
    it("biceps", "bíceps braquial", "flete o cotovelo e supina o antebraço", "nervo musculocutâneo", { ac: ["biceps"] }),
    it("braquial", "braquial", "flete o cotovelo", "por baixo do bíceps · nervo musculocutâneo"),
    it("coracobraquial", "coracobraquial", "flete e aduz o braço", "atravessado pelo nervo musculocutâneo"),
    it("triceps", "tríceps braquial", "estende o cotovelo", "nervo radial", { ac: ["triceps"], v: "p" }),
  ] },
  { id: "musculos-antebraco-1", modo: "musculos", regiao: "Antebraço", nivel: "Flexores e pronadores", modelo: "m-antebraco", vista: "a", legenda: "antebraço direito · de frente", itens: [
    it("pronador-redondo", "pronador redondo", "prona o antebraço", "o nervo mediano passa entre as suas duas cabeças"),
    it("flexor-radial-carpo", "flexor radial do carpo", "flete e abduz o punho", "nervo mediano"),
    it("palmar-longo", "palmar longo", "tensiona a aponeurose palmar", "falta em parte das pessoas"),
    it("flexor-ulnar-carpo", "flexor ulnar do carpo", "flete e aduz o punho", "nervo ulnar · o pisiforme fica no seu tendão", { v: [0.6, 0.1] }),
    it("flexor-superficial-dedos", "flexor superficial dos dedos", "flete as falanges médias", "nervo mediano"),
    it("flexor-profundo-dedos", "flexor profundo dos dedos", "flete as falanges distais", "nervos mediano e ulnar"),
    it("flexor-longo-polegar", "flexor longo do polegar", "flete o polegar", "nervo interósseo anterior"),
    it("pronador-quadrado", "pronador quadrado", "prona o antebraço", "profundo, junto ao punho"),
  ] },
  { id: "musculos-antebraco-2", modo: "musculos", regiao: "Antebraço", nivel: "Extensores e supinadores", modelo: "m-antebraco", vista: "p", legenda: "antebraço direito · de trás", itens: [
    it("braquiorradial", "braquiorradial", "flete o cotovelo", "nervo radial · reflexo estilorradial", { v: "l" }),
    it("extensor-radial-longo", "extensor radial longo do carpo", "estende e abduz o punho", "nervo radial", { v: "l" }),
    it("extensor-radial-curto", "extensor radial curto do carpo", "estende o punho", "sai do epicôndilo lateral · cotovelo de tenista", { v: "l" }),
    it("extensor-dedos", "extensor dos dedos", "estende os dedos", "nervo radial (interósseo posterior)"),
    it("extensor-dedo-minimo", "extensor do dedo mínimo", "estende o dedo mínimo", "ao lado do extensor dos dedos"),
    it("extensor-ulnar-carpo", "extensor ulnar do carpo", "estende e aduz o punho", "nervo radial (interósseo posterior)"),
    it("supinador", "supinador", "supina o antebraço", "atravessado pelo ramo profundo do nervo radial"),
    it("extensor-longo-polegar", "extensor longo do polegar", "estende o polegar", "limita a tabaqueira anatômica"),
    it("anconeo", "ancôneo", "ajuda a estender o cotovelo", "pequeno, atrás do cotovelo"),
  ] },
  { id: "musculos-tronco", modo: "musculos", regiao: "Tórax e abdome", nivel: "", modelo: "m-tronco", vista: "a", legenda: "tronco · de frente", itens: [
    it("peitoral-maior", "peitoral maior", "aduz e roda medialmente o braço", "nervos peitorais medial e lateral"),
    it("peitoral-menor", "peitoral menor", "abaixa e protrai a escápula", "insere-se no processo coracoide"),
    it("serratil-anterior", "serrátil anterior", "protrai a escápula", "nervo torácico longo · a lesão dá escápula alada", { v: "l" }),
    it("reto-abdome", "reto do abdome", "flete o tronco", "dentro da bainha do reto · intersecções tendíneas", { ac: ["reto abdominal", "reto do abdomen"] }),
    it("obliquo-externo", "oblíquo externo do abdome", "flete e gira o tronco", "fibras para baixo e para dentro · forma o ligamento inguinal", { ac: ["obliquo externo"], v: [-0.9, 0.1] }),
    it("obliquo-interno", "oblíquo interno do abdome", "flete e gira o tronco", "fibras para cima e para dentro", { ac: ["obliquo interno"], v: [-0.9, 0.1] }),
    it("transverso-abdome", "transverso do abdome", "comprime o abdome", "o mais profundo da parede anterolateral", { ac: ["transverso abdominal", "transverso"], v: [-0.9, 0.1] }),
    it("diafragma", "diafragma", "principal músculo da inspiração", "nervo frênico (C3 a C5)", { v: [-0.4, -0.25] }),
  ] },
  { id: "musculos-dorso", modo: "musculos", regiao: "Dorso", nivel: "", modelo: "m-dorso", vista: "p", legenda: "dorso · de trás", itens: [
    it("trapezio", "trapézio", "eleva, retrai e gira a escápula", "nervo acessório (XI)"),
    it("latissimo", "latíssimo do dorso", "estende, aduz e roda medialmente o braço", "nervo toracodorsal", { ac: ["grande dorsal", "latissimo"] }),
    it("levantador-escapula", "levantador da escápula", "eleva a escápula", "nervo dorsal da escápula", { ac: ["elevador da escapula"] }),
    it("romboide-maior", "romboide maior", "retrai a escápula", "nervo dorsal da escápula", { ac: ["rombóide maior"] }),
    it("romboide-menor", "romboide menor", "retrai a escápula", "logo acima do romboide maior", { ac: ["rombóide menor"] }),
    it("iliocostal", "iliocostal", "eretor da espinha · coluna de fora", "estende a coluna"),
    it("longuissimo", "longuíssimo", "eretor da espinha · coluna do meio", "estende a coluna", { ac: ["longissimo", "dorsal longo"] }),
    it("espinal", "espinal", "eretor da espinha · coluna de dentro", "junto aos processos espinhosos", { ac: ["espinhal"] }),
    it("esplenio-cabeca", "esplênio da cabeça", "estende e gira a cabeça", "da nuca ao processo mastoide"),
    it("quadrado-lombo", "quadrado do lombo", "inclina o tronco para o lado", "da crista ilíaca à 12ª costela", { ac: ["quadrado lombar"] }),
  ] },
  { id: "musculos-quadril", modo: "musculos", regiao: "Quadril", nivel: "", modelo: "m-quadril", vista: "p", legenda: "quadril · de trás", itens: [
    it("gluteo-maximo", "glúteo máximo", "estende e roda lateralmente a coxa", "nervo glúteo inferior"),
    it("gluteo-medio", "glúteo médio", "abduz a coxa · segura a pelve na marcha", "nervo glúteo superior · sinal de Trendelenburg", { v: [Math.PI + 0.9, 0.1] }),
    it("gluteo-minimo", "glúteo mínimo", "abduz e roda medialmente a coxa", "o mais profundo dos glúteos", { v: [Math.PI + 0.9, 0.1] }),
    it("piriforme", "piriforme", "roda lateralmente a coxa", "sai pelo forame isquiático maior · referência do nervo isquiático"),
    it("obturador-interno", "obturador interno", "roda lateralmente a coxa", "sai da pelve pelo forame isquiático menor"),
    it("quadrado-femoral", "quadrado femoral", "roda lateralmente a coxa", "do túber isquiático ao fêmur", { ac: ["quadrado da coxa"] }),
    it("psoas-maior", "psoas maior", "flete a coxa", "das vértebras lombares ao trocânter menor", { ac: ["psoas"], v: "a" }),
    it("iliaco", "ilíaco", "flete a coxa", "na fossa ilíaca · com o psoas forma o iliopsoas", { v: "a" }),
  ] },
  { id: "musculos-coxa", modo: "musculos", regiao: "Coxa", nivel: "", modelo: "m-coxa", vista: "a", legenda: "coxa direita · de frente", itens: [
    it("reto-femoral", "reto femoral", "estende o joelho e flete a coxa", "o único do quadríceps que cruza o quadril", { ac: ["reto da coxa"] }),
    it("vasto-lateral", "vasto lateral", "estende o joelho", "local de injeção intramuscular", { v: "l" }),
    it("vasto-medial", "vasto medial", "estende o joelho", "segura a patela no lugar", { v: [0.5, 0.1] }),
    it("vasto-intermedio", "vasto intermédio", "estende o joelho", "por baixo do reto femoral"),
    it("sartorio", "sartório", "flete, abduz e roda lateralmente a coxa", "o músculo mais longo do corpo", { ac: ["costureiro"] }),
    it("gracil", "grácil", "aduz a coxa", "nervo obturatório · pata de ganso", { v: [0.9, 0.1] }),
    it("pectineo", "pectíneo", "aduz e flete a coxa", "no assoalho do trígono femoral"),
    it("biceps-femoral", "bíceps femoral", "flete o joelho", "isquiotibial lateral · insere-se na cabeça da fíbula", { ac: ["biceps da coxa"], v: "p" }),
    it("semitendineo", "semitendíneo", "flete o joelho e estende a coxa", "isquiotibial medial · pata de ganso", { ac: ["semitendinoso"], v: "p" }),
    it("semimembranaceo", "semimembranáceo", "flete o joelho e estende a coxa", "isquiotibial medial, por baixo do semitendíneo", { ac: ["semimembranoso"], v: "p" }),
  ] },
  { id: "musculos-perna", modo: "musculos", regiao: "Perna", nivel: "", modelo: "m-perna", vista: "a", legenda: "perna direita · de frente", itens: [
    it("tibial-anterior", "tibial anterior", "dorsiflexão e inversão do pé", "nervo fibular profundo"),
    it("extensor-longo-dedos", "extensor longo dos dedos", "estende os dedos do pé", "nervo fibular profundo"),
    it("extensor-longo-halux", "extensor longo do hálux", "estende o hálux", "nervo fibular profundo (L5)"),
    it("fibular-longo", "fibular longo", "eversão do pé", "nervo fibular superficial", { ac: ["peroneiro longo"], v: "l" }),
    it("fibular-curto", "fibular curto", "eversão do pé", "insere-se na base do 5º metatarso", { ac: ["peroneiro curto"], v: "l" }),
    it("gastrocnemio", "gastrocnêmio", "flexão plantar · ajuda a fletir o joelho", "duas cabeças · tendão calcâneo", { ac: ["gastrocnemios", "gemeos"], v: "p" }),
    it("soleo", "sóleo", "flexão plantar", "por baixo do gastrocnêmio · tendão calcâneo", { ac: ["solear"], v: "p" }),
    it("popliteo", "poplíteo", "destrava o joelho", "atrás do joelho", { v: "p" }),
    it("tibial-posterior", "tibial posterior", "flexão plantar e inversão do pé", "nervo tibial · sustenta o arco medial", { v: "p" }),
    it("flexor-longo-halux", "flexor longo do hálux", "flete o hálux", "nervo tibial", { v: "p" }),
  ] },
];

/* ============================== ECG ============================== */
const e = (id: string, nome: string, apoio: string, onde: string, ac: string[] = []): ItemDef => ({ id, nome, apoio, pista: apoio, onde, ...(ac.length ? { aceitos: ac } : {}) });
const ECG: Bruto[] = [
  { id: "ecg-1", modo: "ecg", regiao: "ECG", nivel: "Ritmos básicos", itens: [
    e("sinusal", "ritmo sinusal", "onda P antes de cada QRS · 50 a 100 por minuto", "P, QRS estreito e T em sequência, com RR regular", ["sinusal", "ritmo sinusal normal"]),
    e("bradi-sinusal", "bradicardia sinusal", "sinusal abaixo de 50 por minuto", "ritmo sinusal lento, com P antes de cada QRS", ["bradicardia"]),
    e("taqui-sinusal", "taquicardia sinusal", "sinusal acima de 100 por minuto", "ritmo sinusal rápido, com P antes de cada QRS", ["taquicardia"]),
    e("arritmia-sinusal", "arritmia sinusal", "sinusal com RR que varia com a respiração", "P normal antes de cada QRS, com o RR acelerando e freando", ["arritmia sinusal respiratoria", "arritmia respiratoria"]),
    e("fa", "fibrilação atrial", "RR irregular · sem onda P", "RR irregularmente irregular, sem onda P", ["fa", "fibrilacao auricular"]),
    e("flutter", "flutter atrial", "ondas F em dente de serra · cerca de 300 por minuto", "ondas F em dente de serra entre os QRS", ["flutter", "flutter auricular"]),
    e("tsv", "taquicardia supraventricular", "QRS estreito, regular e muito rápido · sem P visível", "taquicardia regular de QRS estreito, perto de 180 por minuto", ["tsv", "tpsv", "taquicardia paroxistica supraventricular", "taquicardia por reentrada nodal", "trn"]),
  ] },
  { id: "ecg-2", modo: "ecg", regiao: "ECG", nivel: "Bloqueios", itens: [
    e("bav1", "BAV de primeiro grau", "PR acima de 0,20 s · toda P conduz", "PR longo e fixo, sem P bloqueada", ["bav 1 grau", "bav de 1 grau", "bav 1", "bav i", "bloqueio atrioventricular de primeiro grau", "bloqueio av de primeiro grau", "bav primeiro grau"]),
    e("mobitz1", "Mobitz I", "BAV de 2º grau · o PR aumenta até uma P não conduzir", "PR cada vez mais longo até uma P bloqueada (Wenckebach)", ["mobitz 1", "wenckebach", "bav de segundo grau mobitz i", "bav 2 grau mobitz 1", "bav de 2 grau mobitz i", "mobitz tipo 1", "mobitz tipo i"]),
    e("mobitz2", "Mobitz II", "BAV de 2º grau · PR fixo e P bloqueada de repente", "PR constante, com uma P que não conduz sem aviso", ["mobitz 2", "bav de segundo grau mobitz ii", "bav 2 grau mobitz 2", "bav de 2 grau mobitz ii", "mobitz tipo 2", "mobitz tipo ii"]),
    e("bavt", "bloqueio AV total", "P e QRS sem relação · escape lento", "ondas P regulares que não conduzem, com QRS de escape lento", ["bavt", "bav total", "bloqueio atrioventricular total", "bav de terceiro grau", "bav de 3 grau", "bav 3 grau", "bav 3", "bloqueio av de terceiro grau", "bloqueio atrioventricular de terceiro grau"]),
    e("brd", "bloqueio de ramo direito", "QRS largo · rSR' em V1 (orelha de coelho)", "QRS de 0,12 s ou mais, com rSR' em V1", ["brd", "bloqueio do ramo direito", "bloqueio completo de ramo direito"]),
    e("bre", "bloqueio de ramo esquerdo", "QRS largo · R alargada e entalhada em V6, sem q", "QRS de 0,12 s ou mais, com R larga em torre em V6", ["bre", "bloqueio do ramo esquerdo", "bloqueio completo de ramo esquerdo"]),
  ] },
  { id: "ecg-3", modo: "ecg", regiao: "ECG", nivel: "Ventriculares e parada", itens: [
    e("esv", "extrassístoles ventriculares", "batimento precoce, largo, sem P · pausa depois", "batimentos largos e precoces no meio do ritmo sinusal", ["extrassistole ventricular", "esv", "extra-sistole ventricular", "extra-sistoles ventriculares", "extrassistoles", "ev"]),
    e("tv", "taquicardia ventricular", "monomórfica · QRS largo, regular e rápido", "QRS largo e igual, regular e rápido", ["tv", "taquicardia ventricular monomorfica", "tv monomorfica", "tvm"]),
    e("torsades", "torsades de pointes", "QRS que gira em torno da linha de base · QT longo", "TV polimórfica em fusos, com a amplitude crescendo e diminuindo", ["torsades", "torsade de pointes", "torsade", "tv polimorfica", "taquicardia ventricular polimorfica"]),
    e("fv", "fibrilação ventricular", "atividade caótica sem QRS · ritmo chocável", "ondulação caótica, sem QRS definido", ["fv"]),
    e("assistolia", "assistolia", "linha reta · ritmo não chocável", "sem atividade elétrica ventricular", ["assistole"]),
    e("aesp", "atividade elétrica sem pulso", "ritmo organizado no monitor, paciente sem pulso · não chocável", "há ritmo organizado no monitor, mas o paciente não tem pulso", ["aesp"]),
    e("idioventricular", "ritmo idioventricular", "QRS largo, lento e regular · sem P", "escape ventricular: QRS largo entre 20 e 40 por minuto", ["idioventricular", "escape ventricular", "ritmo de escape ventricular", "riv"]),
  ] },
  { id: "ecg-4", modo: "ecg", regiao: "ECG", nivel: "Padrões que matam", itens: [
    e("supra", "infarto com supra de ST", "supradesnivelamento de ST convexo · onda Q", "ST elevado e convexo, juntando-se à T", ["supra de st", "iamcsst", "iam com supra", "infarto com supra", "supradesnivelamento de st", "iam com supra de st", "infarto agudo do miocardio com supra de st", "iam", "infarto"]),
    e("hipercalemia", "hipercalemia", "T alta, estreita e pontiaguda (em tenda)", "T apiculada e simétrica, P achatada e QRS alargando", ["hiperpotassemia", "t apiculada", "onda t apiculada"]),
    e("wpw", "Wolff-Parkinson-White", "PR curto · onda delta · QRS alargado", "pré-excitação: PR curto e onda delta no início do QRS", ["wpw", "pre-excitacao", "pre-excitacao ventricular", "wolff parkinson white", "sindrome de wolff-parkinson-white", "pre excitacao"]),
    e("brugada", "Brugada", "V1: supra de ST descendente (em corcova) e T negativa", "padrão tipo 1: ST elevado em corcova com T invertida em V1 e V2", ["sindrome de brugada", "padrao de brugada", "brugada tipo 1"]),
    e("qt-longo", "QT longo", "QT corrigido acima de 0,48 s · risco de torsades", "intervalo QT prolongado para a frequência", ["sindrome do qt longo", "intervalo qt longo", "qt prolongado", "qtc longo"]),
    e("pericardite", "pericardite", "supra de ST côncavo e difuso · infra de PR", "ST elevado e côncavo, com o segmento PR rebaixado", ["pericardite aguda"]),
    e("hipotermia", "hipotermia", "onda J (de Osborn) no fim do QRS · bradicardia", "entalhe positivo no fim do QRS, com bradicardia e QT longo", ["onda j", "onda de osborn", "osborn"]),
    e("digital", "intoxicação digitálica", "infra de ST em colher · QT curto", "ST escavado em colher de pedreiro, T achatada e QT curto", ["digital", "efeito digitalico", "digoxina", "intoxicacao por digoxina", "impregnacao digitalica", "intoxicacao digitalica"]),
  ] },
];

/* ============================== COMPLETO ==============================
   Tudo o mais que o BodyParts3D tem como peça separada, para quem quer ir além do principal. */
const slug = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
/** nome, malha(s) no BodyParts3D, apoio */
const x = (nome: string, en: string | string[], apoio: string, extra: Extra = {}): ItemDef => ({ ...it(slug(nome), nome, apoio, apoio, extra), en });
const ORD = ["primeir", "segund", "terceir", "quart", "quint", "sext", "sétim", "oitav", "non", "décim", "décima primeir", "décima segund"];
const ROM = ["I", "II", "III", "IV", "V"];
const vertebra = (letra: string, n: number, regiao: string) => it(`vertebra-${letra.toLowerCase()}${n}`, `vértebra ${letra}${n}`, `${ORD[n - 1]}a vértebra ${regiao}`, `${n}ª ${regiao}, de cima para baixo`, { ac: [`${letra}${n}`, `${n} vertebra ${regiao}`], p: [`${letra.toLowerCase()}${n}`] });
const costela = (n: number) => it(`costela-${n}`, `${ORD[n - 1]}a costela`, n <= 7 ? "costela verdadeira" : n <= 10 ? "costela falsa" : "costela flutuante", `${n}ª costela, de cima para baixo`, { ac: [`costela ${n}`, `${n} costela`, `${n}a costela`], p: [`costela${n}`], v: n > 10 ? [-1.0, 0.1] : undefined });
const DEDOS = ["polegar", "indicador", "dedo médio", "dedo anular", "dedo mínimo"];
const ARTELHOS = ["hálux", "segundo dedo", "terceiro dedo", "quarto dedo", "quinto dedo"];
const raio = (base: string, pre: string, n: number, apoio: string) => it(`${base}-${n}`, `${ORD[n - 1]}o ${base}`, apoio, `${base} ${ROM[n - 1]}`, { ac: [`${base} ${n}`, `${n} ${base}`, `${base} ${ROM[n - 1]}`, `${n}o ${base}`], p: [`${pre}-${n}`] });
const falange = (tipo: "proximal" | "média" | "distal", dedo: string, peca: string) => it(`falange-${slug(tipo)}-${slug(dedo)}`, `falange ${tipo} do ${dedo}`, tipo === "proximal" ? "a primeira falange do dedo" : tipo === "média" ? "a falange do meio" : "a ponta do dedo", `${tipo} · ${dedo}`, { p: [peca] });

const OSSOS_MAIS: Bruto[] = [
  { id: "ossos-coluna-2", modo: "ossos", regiao: "Coluna vertebral", nivel: "Cervicais e lombares, uma a uma", modelo: "coluna", vista: "l", legenda: "coluna · de lado", itens: [
    ...[3, 4, 5, 6, 7].map((n) => vertebra("C", n, "cervical")), ...[1, 2, 3, 4, 5].map((n) => vertebra("L", n, "lombar")) ] },
  { id: "ossos-coluna-3", modo: "ossos", regiao: "Coluna vertebral", nivel: "Torácicas de T1 a T6", modelo: "coluna", vista: "l", legenda: "coluna · de lado", itens: [1, 2, 3, 4, 5, 6].map((n) => vertebra("T", n, "torácica")) },
  { id: "ossos-coluna-4", modo: "ossos", regiao: "Coluna vertebral", nivel: "Torácicas de T7 a T12", modelo: "coluna", vista: "l", legenda: "coluna · de lado", itens: [7, 8, 9, 10, 11, 12].map((n) => vertebra("T", n, "torácica")) },
  { id: "ossos-torax-2", modo: "ossos", regiao: "Tórax", nivel: "Costelas da 2ª à 7ª", modelo: "torax", vista: "a", legenda: "tórax · de frente", itens: [2, 3, 4, 5, 6, 7].map(costela) },
  { id: "ossos-torax-3", modo: "ossos", regiao: "Tórax", nivel: "Costelas da 8ª à 12ª", modelo: "torax", vista: "a", legenda: "tórax · de frente", itens: [8, 9, 10, 11, 12].map(costela) },
  { id: "ossos-ms-3", modo: "ossos", regiao: "Membro superior", nivel: "Metacarpos e polegar", modelo: "mao-ossos", vista: "a", legenda: "mão direita · palma", itens: [
    ...[1, 2, 3, 4, 5].map((n) => raio("metacarpo", "metacarpo", n, `na base do ${DEDOS[n - 1]}`)), falange("proximal", "polegar", "fp-1"), falange("distal", "polegar", "fd-1") ] },
  { id: "ossos-ms-4", modo: "ossos", regiao: "Membro superior", nivel: "Falanges do indicador e do dedo médio", modelo: "mao-ossos", vista: "a", legenda: "mão direita · palma", itens: [2, 3].flatMap((d) => [falange("proximal", DEDOS[d - 1], `fp-${d}`), falange("média", DEDOS[d - 1], `fm-${d}`), falange("distal", DEDOS[d - 1], `fd-${d}`)]) },
  { id: "ossos-ms-5", modo: "ossos", regiao: "Membro superior", nivel: "Falanges do anular e do dedo mínimo", modelo: "mao-ossos", vista: "a", legenda: "mão direita · palma", itens: [4, 5].flatMap((d) => [falange("proximal", DEDOS[d - 1], `fp-${d}`), falange("média", DEDOS[d - 1], `fm-${d}`), falange("distal", DEDOS[d - 1], `fd-${d}`)]) },
  { id: "ossos-mi-3", modo: "ossos", regiao: "Membro inferior", nivel: "Metatarsos e hálux", modelo: "pe-ossos", vista: [-0.9, 0.75], legenda: "pé direito · de cima", itens: [
    ...[1, 2, 3, 4, 5].map((n) => raio("metatarso", "metatarso", n, `na base do ${ARTELHOS[n - 1]}`)), falange("proximal", "hálux", "pfp-1"), falange("distal", "hálux", "pfd-1"),
    it("sesamoide", "osso sesamoide", "sob a cabeça do 1º metatarso", "pequeno, dentro do tendão do flexor curto do hálux", { ac: ["sesamoide", "sesamóide"], p: ["sesamoide"], v: [0.6, -0.6] }) ] },
  { id: "ossos-mi-4", modo: "ossos", regiao: "Membro inferior", nivel: "Falanges do 2º e do 3º dedos do pé", modelo: "pe-ossos", vista: [-0.9, 0.75], legenda: "pé direito · de cima", itens: [2, 3].flatMap((d) => [falange("proximal", ARTELHOS[d - 1], `pfp-${d}`), falange("média", ARTELHOS[d - 1], `pfm-${d}`), falange("distal", ARTELHOS[d - 1], `pfd-${d}`)]) },
  { id: "ossos-mi-5", modo: "ossos", regiao: "Membro inferior", nivel: "Falanges do 4º e do 5º dedos do pé", modelo: "pe-ossos", vista: [-0.9, 0.75], legenda: "pé direito · de cima", itens: [4, 5].flatMap((d) => [falange("proximal", ARTELHOS[d - 1], `pfp-${d}`), falange("média", ARTELHOS[d - 1], `pfm-${d}`), falange("distal", ARTELHOS[d - 1], `pfd-${d}`)]) },
];

const mm = (id: string, regiao: string, nivel: string, contexto: string, vista: Vista, legenda: string, itens: ItemDef[], principal = false): Bruto => ({ id, modo: "musculos", regiao, nivel, contexto, modelo: id, vista, legenda, itens, principal });
const MUSCULOS_MAIS: Bruto[] = [
  mm("musculos-cabeca-3", "Cabeça e pescoço", "Mímica: boca e nariz", "m-cabeca", [-0.8, 0.05], "cabeça e pescoço", [
    x("prócero", "procerus", "puxa a pele entre as sobrancelhas para baixo", { v: "a" }),
    x("nasal", "nasalis", "comprime e dilata a narina", { ac: ["musculo nasal"], v: "a" }),
    x("levantador do lábio superior", "levator labii superioris", "ergue o lábio superior", { v: "a" }),
    x("levantador do lábio superior e da asa do nariz", "levator labii superioris alaeque nasi", "ergue o lábio superior e abre a narina", { v: "a" }),
    x("levantador do ângulo da boca", "levator anguli oris", "ergue o canto da boca", { ac: ["canino"], v: "a" }),
    x("zigomático menor", "zygomaticus minor", "ergue o lábio superior", { v: "a" }),
    x("risório", "risorius", "puxa o canto da boca para o lado", {}),
    x("abaixador do ângulo da boca", "depressor anguli oris", "puxa o canto da boca para baixo", { ac: ["depressor do angulo da boca", "triangular dos labios"], v: "a" }),
    x("abaixador do lábio inferior", "depressor labii inferioris", "puxa o lábio inferior para baixo", { ac: ["depressor do labio inferior"], v: "a" }),
    x("mentual", "mentalis", "ergue e enruga a pele do queixo", { ac: ["mentoniano"], v: "a" }),
  ]),
  mm("musculos-cabeca-4", "Cabeça e pescoço", "Pescoço: hioideos e pré-vertebrais", "m-cabeca", [-0.8, 0.05], "cabeça e pescoço", [
    x("gênio-hióideo", "geniohyoid", "puxa o hioide para a frente", { ac: ["genio hioideo", "geniohioideo"], v: [-0.5, -0.8] }),
    x("estilo-hióideo", "stylohyoid", "ergue e retrai o hioide", { ac: ["estilo hioideo", "estilohioideo"], v: "l" }),
    x("tíreo-hióideo", "thyrohyoid", "abaixa o hioide e ergue a laringe", { ac: ["tireo hioideo", "tireohioideo", "tireo-hioideo"], v: "a" }),
    x("esternotireóideo", "sternothyroid", "abaixa a laringe", { ac: ["esterno-tireoideo", "esternotireoideo", "esterno tireoideo"], v: "a" }),
    x("escaleno posterior", "scalenus posterior", "eleva a 2ª costela", { v: "l" }),
    x("longo da cabeça", "longus capitis", "flete a cabeça", { v: "a" }),
    x("longo do pescoço", ["superior oblique part of longus colli", "vertical intermediate part of longus colli", "inferior oblique part of longus colli"], "flete o pescoço", { v: "a" }),
    x("reto anterior da cabeça", "rectus capitis anterior", "flete a cabeça sobre o atlas", { v: [-0.3, -0.5] }),
    x("reto lateral da cabeça", "rectus capitis lateralis", "inclina a cabeça para o lado", { v: [-0.9, -0.4] }),
  ]),
  mm("musculos-cabeca-5", "Cabeça e pescoço", "Suboccipitais e outros", "m-cabeca", [Math.PI + 0.4, 0.05], "cabeça e pescoço", [
    x("reto posterior maior da cabeça", "rectus capitis posterior major", "estende e gira a cabeça · do áxis ao occipital", {}),
    x("reto posterior menor da cabeça", "rectus capitis posterior minor", "estende a cabeça · do atlas ao occipital", {}),
    x("oblíquo superior da cabeça", "obliquus capitis superior", "estende e inclina a cabeça", {}),
    x("oblíquo inferior da cabeça", "obliquus capitis inferior", "gira o atlas e a cabeça", {}),
    x("corrugador do supercílio", "corrugator supercilii", "junta as sobrancelhas", { v: "a" }),
    x("abaixador do septo nasal", "depressor septi nasi", "puxa o septo do nariz para baixo", { ac: ["depressor do septo nasal"], v: "a" }),
    x("temporoparietal", "temporoparietalis", "tensiona o couro cabeludo acima da orelha", { v: "l" }),
  ]),
  mm("musculos-antebraco-3", "Antebraço", "Polegar e indicador: os profundos", "m-antebraco", "p", "antebraço direito · de trás", [
    x("abdutor longo do polegar", "abductor pollicis longus", "abduz o polegar · limita a tabaqueira anatômica", {}),
    x("extensor curto do polegar", "extensor pollicis brevis", "estende a falange proximal do polegar · limita a tabaqueira anatômica", {}),
    x("extensor do indicador", "extensor indicis", "estende o indicador sozinho", {}),
    x("lumbricais", "set of lumbricals of hand", "fletem a metacarpofalângica e estendem as interfalângicas", { ac: ["lumbricais da mao", "lumbrical"], v: "a" }),
    x("interósseos palmares", "set of palmar interossei of hand", "aduzem os dedos · nervo ulnar", { ac: ["interosseo palmar"], v: "a" }),
    x("interósseos dorsais", "set of dorsal interossei of hand", "abduzem os dedos · nervo ulnar", { ac: ["interosseo dorsal"] }),
  ]),
  mm("musculos-antebraco-4", "Antebraço", "Mão: tenar e hipotenar", "m-antebraco", "a", "antebraço direito · de frente", [
    x("abdutor curto do polegar", "abductor pollicis brevis", "abduz o polegar · eminência tenar, nervo mediano", {}),
    x("flexor curto do polegar", ["superficial head of flexor pollicis brevis", "deep head of flexor pollicis brevis"], "flete o polegar · eminência tenar", {}),
    x("oponente do polegar", "opponens pollicis", "leva o polegar ao encontro dos outros dedos · nervo mediano", {}),
    x("adutor do polegar", ["oblique head of adductor pollicis", "transverse head of adductor pollicis"], "aduz o polegar · nervo ulnar", {}),
    x("abdutor do dedo mínimo", "abductor digiti minimi of hand", "abduz o dedo mínimo · eminência hipotenar", { v: [0.6, 0.1] }),
    x("flexor curto do dedo mínimo", "flexor digiti minimi brevis of hand", "flete o dedo mínimo · eminência hipotenar", { v: [0.6, 0.1] }),
    x("oponente do dedo mínimo", "opponens digiti minimi of hand", "aprofunda a palma · eminência hipotenar", { v: [0.6, 0.1] }),
  ]),
  mm("musculos-tronco-2", "Tórax e abdome", "Parede do tórax", "m-tronco", "a", "tronco · de frente", [
    x("subclávio", "subclavius", "fixa a clavícula · entre a clavícula e a 1ª costela", { v: [-0.3, 0.3] }),
    x("intercostais externos", "external intercostal muscle", "elevam as costelas na inspiração · fibras para baixo e para a frente", { ac: ["intercostal externo"], v: [-0.9, 0.1] }),
    x("intercostais internos", "internal intercostal muscle", "abaixam as costelas na expiração forçada", { ac: ["intercostal interno"], v: [-0.9, 0.1] }),
    x("intercostais íntimos", "innermost intercostal muscle", "a camada mais funda · o feixe vasculonervoso passa entre eles e os internos", { ac: ["intercostal intimo"], v: [-0.9, 0.1] }),
    x("transverso do tórax", "transversus thoracis", "abaixa as costelas · por dentro do esterno", {}),
    x("levantadores das costelas", ["set of levatores costarum breves", "set of levatores costarum longi"], "elevam as costelas · das vértebras à costela de baixo", { ac: ["levantador das costelas", "elevadores das costelas"], v: "p" }),
    x("piramidal", "pyramidalis", "tensiona a linha alba · na frente do reto do abdome, junto ao púbis", { ac: ["piramidal do abdome"] }),
  ]),
  mm("musculos-dorso-2", "Dorso", "Profundos do dorso", "m-dorso", "p", "dorso · de trás", [
    x("serrátil posterior superior", "serratus posterior superior", "eleva as costelas de cima", {}),
    x("serrátil posterior inferior", "serratus posterior inferior", "abaixa as costelas de baixo", {}),
    x("esplênio do pescoço", "splenius cervicis", "estende e gira o pescoço", {}),
    x("semiespinal da cabeça", "semispinalis capitis", "estende a cabeça", { ac: ["semi-espinal da cabeca", "semiespinhal da cabeca"] }),
    x("semiespinal do pescoço", "semispinalis cervicis", "estende e gira o pescoço", { ac: ["semi-espinal do pescoco", "semiespinhal do pescoco"] }),
    x("semiespinal do tórax", "semispinalis thoracis", "estende e gira a coluna torácica", { ac: ["semi-espinal do torax", "semiespinhal do torax"] }),
    x("multífido", "multifidus", "estabiliza as vértebras · mais forte na região lombar", { ac: ["multifidos"] }),
    x("rotadores", ["cervical rotator", "thoracic rotator", "lumbar rotator"], "giram as vértebras · os mais profundos", { ac: ["rotador"] }),
    x("interespinais", ["set of interspinales cervicis", "set of interspinales thoracis", "set of interspinales lumborum"], "entre os processos espinhosos", { ac: ["interespinhais", "interespinal"] }),
    x("intertransversários", ["set of anterior cervical intertransversarii", "set of posterior cervical intertransversarii", "set of lateral lumbar intertransversarius muscles", "set of medial lumbar intertransversarius muscles"], "entre os processos transversos", { ac: ["intertransversario"] }),
  ]),
  mm("musculos-quadril-2", "Quadril", "Rotadores curtos e assoalho da pelve", "m-quadril", "p", "quadril · de trás", [
    x("gêmeo superior", "gemellus superior", "roda lateralmente a coxa · acima do obturador interno", {}),
    x("gêmeo inferior", "gemellus inferior", "roda lateralmente a coxa · abaixo do obturador interno", {}),
    x("obturador externo", "obturator externus", "roda lateralmente a coxa · nervo obturatório", { v: "a" }),
    x("coccígeo", "coccygeus", "fecha o assoalho da pelve por trás", { ac: ["isquiococcigeo"], v: [Math.PI, -0.7] }),
    x("iliococcígeo", "iliococcygeus", "parte do levantador do ânus", { v: [Math.PI, -0.7] }),
    x("pubococcígeo", "pubococcygeus", "parte do levantador do ânus", { v: [Math.PI, -0.7] }),
    x("puborretal", "puborectalis", "parte do levantador do ânus · forma a alça que segura o reto", { v: [Math.PI, -0.7] }),
    x("esfíncter externo do ânus", "external anal sphincter", "fecha o canal anal · controle voluntário", { ac: ["esfincter anal externo"], v: [Math.PI, -0.9] }),
  ]),
  mm("musculos-coxa-2", "Coxa", "Adutores", "m-coxa", [0.5, 0.1], "coxa direita · de frente", [
    x("adutor longo", "adductor longus", "aduz a coxa · nervo obturatório", {}),
    x("adutor curto", "adductor brevis", "aduz a coxa · atrás do adutor longo", {}),
    x("adutor magno", "adductor magnus", "aduz e estende a coxa · tem o hiato dos adutores", { ac: ["grande adutor"], v: [Math.PI - 0.5, 0.1] }),
    x("adutor mínimo", "adductor minimus", "a parte de cima do adutor magno", { v: [Math.PI - 0.5, 0.1] }),
    x("tensor da fáscia lata", "tensor fasciae latae", "abduz e flete a coxa · tensiona o trato iliotibial", { v: "l" }),
  ], true),
  mm("musculos-perna-2", "Perna", "Perna e dorso do pé: o que falta", "m-perna", "a", "perna direita · de frente", [
    x("flexor longo dos dedos", "flexor digitorum longus", "flete os dedos do pé · nervo tibial", { v: "p" }),
    x("plantar", "plantaris", "ventre pequeno e tendão muito longo", { ac: ["plantar delgado"], v: "p" }),
    x("fibular terceiro", "fibularis tertius", "dorsiflexão e eversão do pé", { ac: ["peroneiro terceiro"] }),
    x("extensor curto dos dedos", "extensor digitorum brevis", "estende os dedos · no dorso do pé", { v: [-0.9, 0.7] }),
    x("extensor curto do hálux", "extensor hallucis brevis", "estende o hálux · no dorso do pé", { v: [-0.9, 0.7] }),
  ]),
  mm("musculos-perna-3", "Perna", "Planta do pé: 1ª e 2ª camadas", "m-perna", [-0.6, -0.9], "perna direita · de frente", [
    x("abdutor do hálux", "abductor hallucis", "abduz o hálux · borda medial do pé", { v: [0.9, -0.5] }),
    x("flexor curto dos dedos", "flexor digitorum brevis", "flete as falanges médias dos dedos do pé", {}),
    x("abdutor do dedo mínimo", "abductor digiti minimi of foot", "abduz o quinto dedo · borda lateral do pé", {}),
    x("quadrado plantar", "flexor accessorius", "endireita a tração do flexor longo dos dedos", { ac: ["quadrado da planta", "flexor acessorio"] }),
    x("lumbricais", ["first lumbrical of foot", "second lumbrical of foot", "third lumbrical of foot", "fourth lumbrical of foot"], "fletem a metatarsofalângica dos dedos", { ac: ["lumbricais do pe"] }),
  ]),
  mm("musculos-perna-4", "Perna", "Planta do pé: 3ª e 4ª camadas", "m-perna", [-0.6, -0.9], "perna direita · de frente", [
    x("flexor curto do hálux", ["medial head of flexor hallucis brevis", "lateral head of flexor hallucis brevis"], "flete o hálux · os sesamoides ficam nos seus tendões", {}),
    x("adutor do hálux", ["oblique head of adductor hallucis", "transverse head of adductor hallucis"], "aduz o hálux · duas cabeças", {}),
    x("flexor curto do dedo mínimo", "flexor digiti minimi brevis of foot", "flete o quinto dedo", {}),
    x("oponente do dedo mínimo", "opponens digiti minimi of foot", "puxa o 5º metatarso para a planta", {}),
    x("interósseos plantares", ["first plantar interosseous of foot", "second plantar interosseous of foot", "third plantar interosseous of foot"], "aduzem os dedos do pé", { ac: ["interosseo plantar"] }),
    x("interósseos dorsais", "set of dorsal interossei of foot", "abduzem os dedos do pé", { ac: ["interosseo dorsal"], v: [-0.9, 0.7] }),
  ]),
];

const completa = (lista: Bruto[], principal: boolean): Conjunto[] => lista.map((c) => ({ ...c, grupo: c.id.replace(/-\d+$/, ""), principal: c.principal ?? principal }));
/* ECG para ir além: fora do núcleo "o que cai", por tópicos. Só o que dá para reconhecer numa derivação. */
const ECG_MAIS: Bruto[] = [
  { id: "ecg-5", modo: "ecg", regiao: "ECG", nivel: "Outros ritmos", itens: [
    e("tam", "taquicardia atrial multifocal", "RR irregular · pelo menos três formas de onda P · acima de 100 por minuto", "taquicardia irregular com ondas P de formas diferentes", ["tam", "taquicardia atrial caotica"]),
    e("juncional", "ritmo juncional", "QRS estreito e lento · P invertida colada no QRS", "escape da junção AV: 40 a 60 por minuto, com P retrógrada", ["juncional", "escape juncional", "ritmo de escape juncional"]),
    e("migratorio", "marcapasso migratório", "ondas P de formas diferentes · frequência normal", "o foco atrial muda: P e PR variam, abaixo de 100 por minuto", ["marcapasso atrial migratorio", "ritmo atrial multifocal", "marca-passo migratorio"]),
    e("bav-2-1", "BAV dois para um", "uma P conduz, a seguinte não · não dá para dizer se é Mobitz I ou II", "BAV de 2º grau 2:1: uma P bloqueada para cada P conduzida", ["bav 2:1", "bav 2 para 1", "bav 2 1", "bloqueio av 2:1", "bav de segundo grau 2:1"]),
    e("esa", "extrassístoles atriais", "batimento precoce com P diferente e QRS igual", "batimentos atriais precoces, de QRS estreito, com pausa curta depois", ["extrassistole atrial", "esa", "extrassistoles supraventriculares", "extrassistole supraventricular", "essv"]),
    e("bigeminismo", "bigeminismo ventricular", "um batimento normal, uma extrassístole, sempre alternando", "cada batimento sinusal é seguido de uma extrassístole ventricular", ["bigeminismo"]),
    e("riva", "ritmo idioventricular acelerado", "QRS largo e regular, entre 60 e 100 por minuto · típico da reperfusão", "ritmo ventricular mais rápido que um escape e mais lento que uma TV", ["riva"]),
    e("marcapasso", "marcapasso artificial", "espícula fina antes de um QRS largo", "estimulação ventricular: espícula seguida de QRS largo", ["marcapasso", "ritmo de marcapasso", "marca-passo", "marca-passo artificial"]),
  ] },
  { id: "ecg-6", modo: "ecg", regiao: "ECG", nivel: "Sobrecargas e bloqueio divisional", itens: [
    e("sae", "sobrecarga atrial esquerda", "P larga e entalhada em DII (P mitrale)", "P com 0,12 s ou mais e dois picos", ["sae", "p mitrale", "aumento atrial esquerdo"]),
    e("sad", "sobrecarga atrial direita", "P alta e pontiaguda em DII (P pulmonale)", "P com mais de 2,5 mm de altura", ["sad", "p pulmonale", "aumento atrial direito"]),
    e("sve", "sobrecarga ventricular esquerda", "R muito alta em V5 · ST infradesnivelado com T negativa (strain)", "voltagem aumentada nas derivações esquerdas, com padrão de strain", ["sve", "hve", "hipertrofia ventricular esquerda"]),
    e("svd", "sobrecarga ventricular direita", "R maior que S em V1 · T negativa", "R dominante em V1 com alteração da repolarização", ["svd", "hvd", "hipertrofia ventricular direita"]),
    e("bdas", "bloqueio divisional anterossuperior", "rS em DII, com S profunda · eixo desviado para a esquerda", "hemibloqueio anterior esquerdo: eixo além de -45°, rS nas derivações inferiores", ["bdas", "hemibloqueio anterior esquerdo", "hbae", "bloqueio divisional antero-superior", "bdase"]),
  ] },
  { id: "ecg-7", modo: "ecg", regiao: "ECG", nivel: "Isquemia", itens: [
    e("wellens", "Wellens", "T negativa, profunda e simétrica em V2 e V3 · dor já passou", "sinal de lesão crítica da descendente anterior", ["sindrome de wellens", "padrao de wellens", "sinal de wellens"]),
    e("de-winter", "de Winter", "infra de ST ascendente que entra numa T alta e simétrica", "equivalente de supra: oclusão da descendente anterior", ["padrao de de winter", "dewinter", "sinal de de winter"]),
    e("infra", "isquemia subendocárdica", "infradesnivelamento horizontal do ST", "ST retificado abaixo da linha de base", ["infra de st", "infradesnivelamento de st", "isquemia", "infra"]),
    e("infarto-antigo", "infarto antigo", "onda Q larga e profunda · sem supra", "área eletricamente inativa: Q patológica com T negativa", ["onda q patologica", "area eletricamente inativa", "zona inativa", "infarto previo", "area inativa"]),
  ] },
  { id: "ecg-8", modo: "ecg", regiao: "ECG", nivel: "Eletrólitos e outros", itens: [
    e("hipocalemia", "hipocalemia", "T achatada · onda U evidente", "T baixa, leve infra de ST e onda U depois da T", ["hipopotassemia", "onda u"]),
    e("hipercalcemia", "hipercalcemia", "QT curto · quase sem segmento ST", "a T começa logo depois do QRS", []),
    e("hipocalcemia", "hipocalcemia", "QT longo à custa de um ST comprido · T normal", "segmento ST longo e reto, com T de forma normal", []),
    e("tep", "tromboembolismo pulmonar", "taquicardia sinusal · Q e T negativa em DIII (o Q3T3 do S1Q3T3)", "taquicardia sinusal com sinais de sobrecarga direita aguda", ["tep", "s1q3t3", "embolia pulmonar"]),
    e("repolarizacao-precoce", "repolarização precoce", "supra de ST côncavo com entalhe no ponto J · T alta · jovem saudável", "variante normal: ponto J elevado e entalhado, ST côncavo", ["repolarizacao precoce benigna"]),
  ] },
];

export const CONJUNTOS: Conjunto[] = [...completa(OSSOS, true), ...completa(OSSOS_MAIS, false), ...completa(MUSCULOS, true), ...completa(MUSCULOS_MAIS, false), ...completa(ECG, true), ...completa(ECG_MAIS, false)];
export const conjunto = (id: string) => CONJUNTOS.find((c) => c.id === id);
export const TITULO_MODO: Record<Modo, string> = { ossos: "Ossos", musculos: "Músculos", ecg: "ECG" };
/** "Crânio e face · Neurocrânio" */
export const tituloConjunto = (c: Conjunto) => (c.modo === "ecg" ? `ECG · ${c.nivel}` : c.nivel ? `${c.regiao} · ${c.nivel}` : c.regiao);
