import type { MuscleGroup } from "../schema";

type CatalogExercise = { name: string; muscleGroup: MuscleGroup; aliases: string[] };

// Global catalog (owner_user_id = null). Aliases are lowercase, as users type them.
// Upserted by name, so editing this list and re-running `npm run db:seed` is safe.
export const catalog: CatalogExercise[] = [
  // Peito
  { name: "Supino reto com barra", muscleGroup: "peito", aliases: ["supino", "supino reto", "supino barra", "bench press"] },
  { name: "Supino reto com halteres", muscleGroup: "peito", aliases: ["supino halter", "supino reto halter", "supino com halteres"] },
  { name: "Supino inclinado com barra", muscleGroup: "peito", aliases: ["supino inclinado", "inclinado barra"] },
  { name: "Supino inclinado com halteres", muscleGroup: "peito", aliases: ["supino inclinado halter", "inclinado halter"] },
  { name: "Supino declinado com barra", muscleGroup: "peito", aliases: ["supino declinado", "declinado"] },
  { name: "Supino reto na máquina", muscleGroup: "peito", aliases: ["supino maquina", "chest press", "supino articulado"] },
  { name: "Supino inclinado na máquina", muscleGroup: "peito", aliases: ["supino inclinado maquina", "inclinado articulado"] },
  { name: "Supino no Smith", muscleGroup: "peito", aliases: ["supino smith", "smith supino"] },
  { name: "Crucifixo com halteres", muscleGroup: "peito", aliases: ["crucifixo", "crucifixo reto", "fly"] },
  { name: "Crucifixo inclinado com halteres", muscleGroup: "peito", aliases: ["crucifixo inclinado"] },
  { name: "Crucifixo na máquina (peck deck)", muscleGroup: "peito", aliases: ["peck deck", "voador", "fly maquina", "crucifixo maquina"] },
  { name: "Crossover na polia", muscleGroup: "peito", aliases: ["crossover", "cross over", "cruzamento", "crucifixo polia"] },
  { name: "Flexão de braço", muscleGroup: "peito", aliases: ["flexao", "flexão", "push up", "apoio"] },
  { name: "Paralelas (mergulho)", muscleGroup: "peito", aliases: ["paralelas", "mergulho", "dips", "paralela"] },
  { name: "Pullover com halter", muscleGroup: "peito", aliases: ["pullover", "pull over"] },

  // Costas
  { name: "Puxada frontal na polia", muscleGroup: "costas", aliases: ["puxada", "puxada frontal", "pulldown", "puxada alta", "pulley frente"] },
  { name: "Puxada com triângulo", muscleGroup: "costas", aliases: ["puxada triangulo", "puxada neutra", "puxada fechada"] },
  { name: "Puxada supinada", muscleGroup: "costas", aliases: ["puxada supinada", "puxada pegada supinada"] },
  { name: "Barra fixa", muscleGroup: "costas", aliases: ["barra", "barra fixa", "pull up", "pullup"] },
  { name: "Barra fixa supinada", muscleGroup: "costas", aliases: ["chin up", "chinup", "barra supinada"] },
  { name: "Remada curvada com barra", muscleGroup: "costas", aliases: ["remada curvada", "remada barra", "barbell row"] },
  { name: "Remada unilateral com halter", muscleGroup: "costas", aliases: ["serrote", "remada unilateral", "remada halter"] },
  { name: "Remada baixa na polia", muscleGroup: "costas", aliases: ["remada baixa", "remada sentada", "remada triangulo", "seated row"] },
  { name: "Remada cavalinho", muscleGroup: "costas", aliases: ["cavalinho", "remada t", "t bar", "remada barra t"] },
  { name: "Remada na máquina", muscleGroup: "costas", aliases: ["remada maquina", "remada articulada"] },
  { name: "Remada alta", muscleGroup: "trapezio", aliases: ["remada alta", "upright row"] },
  { name: "Pulldown com braços estendidos", muscleGroup: "costas", aliases: ["pulldown braco estendido", "straight arm pulldown", "pullover polia"] },
  { name: "Levantamento terra", muscleGroup: "posterior", aliases: ["terra", "levantamento terra", "deadlift"] },

  // Ombros
  { name: "Desenvolvimento com halteres", muscleGroup: "ombros", aliases: ["desenvolvimento", "desenvolvimento halter", "shoulder press"] },
  { name: "Desenvolvimento com barra", muscleGroup: "ombros", aliases: ["desenvolvimento barra", "desenvolvimento militar", "military press", "press militar"] },
  { name: "Desenvolvimento na máquina", muscleGroup: "ombros", aliases: ["desenvolvimento maquina", "desenvolvimento articulado"] },
  { name: "Desenvolvimento Arnold", muscleGroup: "ombros", aliases: ["arnold", "arnold press"] },
  { name: "Elevação lateral com halteres", muscleGroup: "ombros", aliases: ["elevacao lateral", "elevação lateral", "lateral raise", "lateral"] },
  { name: "Elevação lateral na polia", muscleGroup: "ombros", aliases: ["elevacao lateral polia", "lateral polia", "lateral cabo"] },
  { name: "Elevação lateral na máquina", muscleGroup: "ombros", aliases: ["elevacao lateral maquina", "lateral maquina"] },
  { name: "Elevação frontal", muscleGroup: "ombros", aliases: ["elevacao frontal", "elevação frontal", "frontal"] },
  { name: "Crucifixo invertido", muscleGroup: "ombros", aliases: ["crucifixo invertido", "voador invertido", "peck deck invertido", "reverse fly"] },
  { name: "Face pull", muscleGroup: "ombros", aliases: ["face pull", "facepull", "puxada para o rosto"] },

  // Trapézio
  { name: "Encolhimento com halteres", muscleGroup: "trapezio", aliases: ["encolhimento", "encolhimento halter", "shrug"] },
  { name: "Encolhimento com barra", muscleGroup: "trapezio", aliases: ["encolhimento barra"] },

  // Bíceps
  { name: "Rosca direta com barra", muscleGroup: "biceps", aliases: ["rosca direta", "rosca barra", "barbell curl"] },
  { name: "Rosca direta com barra W", muscleGroup: "biceps", aliases: ["rosca w", "rosca barra w", "rosca barra ez"] },
  { name: "Rosca alternada com halteres", muscleGroup: "biceps", aliases: ["rosca alternada", "rosca halter"] },
  { name: "Rosca martelo", muscleGroup: "biceps", aliases: ["martelo", "rosca martelo", "hammer curl"] },
  { name: "Rosca Scott", muscleGroup: "biceps", aliases: ["scott", "rosca scott", "preacher curl"] },
  { name: "Rosca concentrada", muscleGroup: "biceps", aliases: ["concentrada", "rosca concentrada"] },
  { name: "Rosca na polia", muscleGroup: "biceps", aliases: ["rosca polia", "rosca cabo", "rosca no cabo"] },
  { name: "Rosca inclinada com halteres", muscleGroup: "biceps", aliases: ["rosca inclinada"] },

  // Tríceps
  { name: "Tríceps na polia (barra)", muscleGroup: "triceps", aliases: ["triceps polia", "triceps pulley", "triceps barra", "pushdown", "tricep pulley"] },
  { name: "Tríceps na polia (corda)", muscleGroup: "triceps", aliases: ["triceps corda", "corda", "triceps na corda"] },
  { name: "Tríceps testa", muscleGroup: "triceps", aliases: ["testa", "triceps testa", "skull crusher"] },
  { name: "Tríceps francês", muscleGroup: "triceps", aliases: ["frances", "francês", "triceps frances"] },
  { name: "Tríceps coice", muscleGroup: "triceps", aliases: ["coice", "triceps coice", "kickback"] },
  { name: "Tríceps banco", muscleGroup: "triceps", aliases: ["triceps banco", "mergulho banco", "bench dip"] },
  { name: "Supino fechado", muscleGroup: "triceps", aliases: ["supino fechado", "supino pegada fechada", "close grip"] },
  { name: "Tríceps overhead na polia", muscleGroup: "triceps", aliases: ["triceps overhead", "triceps acima da cabeca", "frances polia"] },

  // Antebraço
  { name: "Rosca punho", muscleGroup: "antebraco", aliases: ["rosca punho", "flexao de punho", "wrist curl"] },
  { name: "Rosca inversa", muscleGroup: "antebraco", aliases: ["rosca inversa", "rosca pronada", "reverse curl"] },

  // Quadríceps
  { name: "Agachamento livre", muscleGroup: "quadriceps", aliases: ["agachamento", "agacho", "squat", "agachamento barra"] },
  { name: "Agachamento frontal", muscleGroup: "quadriceps", aliases: ["agachamento frontal", "front squat"] },
  { name: "Agachamento no Smith", muscleGroup: "quadriceps", aliases: ["agachamento smith", "smith agachamento"] },
  { name: "Agachamento hack", muscleGroup: "quadriceps", aliases: ["hack", "hack squat", "agachamento hack"] },
  { name: "Agachamento búlgaro", muscleGroup: "quadriceps", aliases: ["bulgaro", "búlgaro", "agachamento bulgaro", "split squat"] },
  { name: "Agachamento goblet", muscleGroup: "quadriceps", aliases: ["goblet", "agachamento goblet", "goblet squat"] },
  { name: "Leg press 45°", muscleGroup: "quadriceps", aliases: ["leg press", "leg", "leg 45", "legpress"] },
  { name: "Leg press horizontal", muscleGroup: "quadriceps", aliases: ["leg horizontal", "leg press horizontal"] },
  { name: "Cadeira extensora", muscleGroup: "quadriceps", aliases: ["extensora", "cadeira extensora", "leg extension"] },
  { name: "Afundo", muscleGroup: "quadriceps", aliases: ["afundo", "avanco", "avanço", "passada", "lunge"] },
  { name: "Sissy squat", muscleGroup: "quadriceps", aliases: ["sissy"] },

  // Posterior de coxa
  { name: "Mesa flexora", muscleGroup: "posterior", aliases: ["flexora", "mesa flexora", "leg curl", "flexora deitada"] },
  { name: "Cadeira flexora", muscleGroup: "posterior", aliases: ["cadeira flexora", "flexora sentada", "flexora sentado"] },
  { name: "Flexora em pé", muscleGroup: "posterior", aliases: ["flexora em pe", "flexora unilateral"] },
  { name: "Stiff", muscleGroup: "posterior", aliases: ["stiff", "stiff barra", "levantamento terra romeno", "rdl", "terra romeno"] },
  { name: "Stiff com halteres", muscleGroup: "posterior", aliases: ["stiff halter", "stiff halteres"] },
  { name: "Good morning", muscleGroup: "posterior", aliases: ["good morning", "bom dia"] },

  // Glúteos
  { name: "Elevação pélvica", muscleGroup: "gluteos", aliases: ["elevacao pelvica", "elevação pélvica", "hip thrust", "pelvica"] },
  { name: "Glúteo na polia (coice)", muscleGroup: "gluteos", aliases: ["gluteo polia", "coice polia", "kickback gluteo"] },
  { name: "Glúteo na máquina", muscleGroup: "gluteos", aliases: ["gluteo maquina", "gluteo 4 apoios"] },
  { name: "Ponte de glúteo", muscleGroup: "gluteos", aliases: ["ponte", "ponte gluteo", "glute bridge"] },
  { name: "Agachamento sumô", muscleGroup: "gluteos", aliases: ["sumo", "sumô", "agachamento sumo"] },
  { name: "Levantamento terra sumô", muscleGroup: "gluteos", aliases: ["terra sumo", "sumo deadlift"] },

  // Adutores / abdutores
  { name: "Cadeira adutora", muscleGroup: "adutores", aliases: ["adutora", "cadeira adutora", "adutor"] },
  { name: "Cadeira abdutora", muscleGroup: "abdutores", aliases: ["abdutora", "cadeira abdutora", "abdutor"] },

  // Panturrilha
  { name: "Panturrilha em pé", muscleGroup: "panturrilha", aliases: ["panturrilha", "panturrilha em pe", "gemeos", "calf raise"] },
  { name: "Panturrilha sentado", muscleGroup: "panturrilha", aliases: ["panturrilha sentado", "solear"] },
  { name: "Panturrilha no leg press", muscleGroup: "panturrilha", aliases: ["panturrilha leg", "panturrilha no leg"] },

  // Abdômen
  { name: "Abdominal supra", muscleGroup: "abdomen", aliases: ["abdominal", "abdominal supra", "crunch", "abdominal reto"] },
  { name: "Abdominal infra", muscleGroup: "abdomen", aliases: ["infra", "abdominal infra", "elevacao de pernas"] },
  { name: "Abdominal na polia", muscleGroup: "abdomen", aliases: ["abdominal polia", "abdominal corda", "cable crunch"] },
  { name: "Abdominal na máquina", muscleGroup: "abdomen", aliases: ["abdominal maquina"] },
  { name: "Elevação de pernas na barra", muscleGroup: "abdomen", aliases: ["elevacao de pernas barra", "hanging leg raise"] },
  { name: "Prancha", muscleGroup: "abdomen", aliases: ["prancha", "plank"] },
  { name: "Abdominal oblíquo", muscleGroup: "abdomen", aliases: ["obliquo", "oblíquo", "abdominal obliquo"] },

  // Lombar
  { name: "Extensão lombar", muscleGroup: "lombar", aliases: ["lombar", "extensao lombar", "hiperextensao", "banco romano"] },
];
