// ============================================================
// Project data — homepage carousel (12 latest projects)
// Images are 512px webp (≈30KB each) for fast loading
// ============================================================

export interface Project {
  id: number;
  title: string;
  slug: string;
  year: string;
  tags: string[];
  desc: string;
  image: string;
}

export const PROJECTS: Project[] = [
  { id: 0, title: "9 Portraits of a Vase", slug: "9-portraits-of-a-vase", year: "2026", tags: ["AI", "Stills"], desc: "UNVEIL® carte blanche for Mathilde Martin.", image: "img/1_vase.webp" },
  { id: 1, title: "Eclipse Shadows", slug: "eclipse-shadows", year: "2026", tags: ["AI", "Stills"], desc: "Eclipse glasses were sold out everywhere. Had to find another way to see it.", image: "img/2_eclipse.webp" },
  { id: 2, title: "Sculpted Optics", slug: "sculpted-optics", year: "2026", tags: ["AI", "Stills"], desc: "In-house editorial series. A speculative study of surreal rear lights.", image: "img/3_optics.webp" },
  { id: 3, title: "Runway", slug: "runway", year: "2026", tags: ["AI", "Video", "Advertising"], desc: "Series of capsule films for Runway AI Festival campaign.", image: "img/4_runway.webp" },
  { id: 4, title: "Kalash", slug: "kalash", year: "2026", tags: ["AI", "Show Visuals"], desc: "Show visuals for Kalash concert at Plénitude Arena for 40,000 fans.", image: "img/5_kalash.webp" },
  { id: 5, title: "Le K", slug: "le-k", year: "2026", tags: ["AI", "Fashion Design", "Stills"], desc: "Introducing Le K, a jeanswear label born from the collaboration of UNVEIL® and designer Marie Bevillon.", image: "img/6_lek.webp" },
  { id: 6, title: "Heliot Emil / SS26", slug: "heliot-emil-ss26", year: "2026", tags: ["AI", "Campaign", "Stills"], desc: "UNVEIL® created the campaign for Heliot Emil SS26 collection, based on Carl Jung’s psychological concept of the shadow.", image: "img/7_heliot.webp" },
  { id: 7, title: "47 Voices", slug: "47-voices", year: "2026", tags: ["AI", "Short Film"], desc: "Inside a strange building, a choir performs. Again and again, they gather for a purpose only they seem to understand.", image: "img/8_47voices.webp" },
  { id: 8, title: "UNVEIL® Meeting Table", slug: "unveil-meeting-table", year: "2026", tags: ["AI", "Furniture Design", "Campaign"], desc: "A table designed to host in our studio in Paris. Made from a 12 mm thick solid aluminum plate.", image: "img/9_table.webp" },
  { id: 9, title: "Balenciaga", slug: "balenciaga", year: "2026", tags: ["AI", "Social Content"], desc: "For Balenciaga’s Summer 26 collection, UNVEIL® created a series of short videos for social media.", image: "img/10_balenciaga.webp" },
  { id: 10, title: "Nodaleto", slug: "nodaleto", year: "2026", tags: ["AI", "Stills", "Campaign"], desc: "UNVEIL® created Nodaleto’s Pre-Spring 26 AI campaign, set in intimate interiors and stylized domestic scenes.", image: "img/11_nodaleto.webp" },
  { id: 11, title: "Salomon", slug: "salomon-shaping-new-futures", year: "2026", tags: ["AI", "Campaign", "Film"], desc: "For Salomon’s new global campaign, UNVEIL® created a 45s film where a character moves through shifting worlds.", image: "img/12_salomon.webp" }
];
