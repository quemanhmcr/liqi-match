import type { ImageSourcePropType } from 'react-native';

import {
  HERO_CLASS_CATALOG,
  heroClassOption,
  type HeroClassLabel,
} from './hero-class-catalog';
import {
  heroDefinitionById,
  type HeroDomainDefinition,
  type HeroId,
} from './hero-domain-catalog';

export type HeroRole = 'Tất cả' | HeroClassLabel;

export type Hero = Omit<HeroDomainDefinition, 'legacySlug'> & {
  /** @deprecated Presentation compatibility only. Use classSlug for semantics. */
  role: Exclude<HeroRole, 'Tất cả'>;
  image: ImageSourcePropType;
  variant?: string;
};

type HeroVisualDefinition = Readonly<{
  id: HeroId;
  image: ImageSourcePropType;
  variant?: string;
}>;

export const HERO_ROLES: HeroRole[] = [
  'Tất cả',
  ...HERO_CLASS_CATALOG.map((option) => option.label),
];

const HERO_VISUAL_CATALOG = [
  {
    id: 'flowborn',
    image: require('../../../assets/anh_mau2/heroes/flowborn.webp'),
    variant: 'Xạ Thủ',
  },
  {
    id: 'flowborn-phep',
    image: require('../../../assets/anh_mau2/heroes/flowborn-phep.webp'),
    variant: 'Pháp Sư',
  },
  {
    id: 'dyadia',
    image: require('../../../assets/anh_mau2/heroes/dyadia.webp'),
    variant: 'Trợ Thủ / Pháp Sư',
  },
  {
    id: 'edras',
    image: require('../../../assets/anh_mau2/heroes/edras.jpg'),
  },
  {
    id: 'goverra',
    image: require('../../../assets/anh_mau2/heroes/goverra.webp'),
  },
  {
    id: 'heino',
    image: require('../../../assets/anh_mau2/heroes/heino.webp'),
  },
  {
    id: 'billow',
    image: require('../../../assets/anh_mau2/heroes/billow.webp'),
  },
  {
    id: 'bolt-baron',
    image: require('../../../assets/anh_mau2/heroes/bolt-baron.webp'),
  },
  {
    id: 'biron',
    image: require('../../../assets/anh_mau2/heroes/biron.webp'),
  },
  {
    id: 'dolia',
    image: require('../../../assets/anh_mau2/heroes/dolia.webp'),
  },
  {
    id: 'charlotte',
    image: require('../../../assets/anh_mau2/heroes/charlotte.webp'),
  },
  {
    id: 'tachi',
    image: require('../../../assets/anh_mau2/heroes/tachi.webp'),
  },
  {
    id: 'dirak',
    image: require('../../../assets/anh_mau2/heroes/dirak.webp'),
  },
  {
    id: 'qi',
    image: require('../../../assets/anh_mau2/heroes/qi.webp'),
  },
  {
    id: 'erin',
    image: require('../../../assets/anh_mau2/heroes/erin.webp'),
  },
  {
    id: 'ming',
    image: require('../../../assets/anh_mau2/heroes/ming.webp'),
  },
  {
    id: 'bijan',
    image: require('../../../assets/anh_mau2/heroes/bijan.webp'),
  },
  {
    id: 'bonnie',
    image: require('../../../assets/anh_mau2/heroes/bonnie.webp'),
  },
  {
    id: 'teeri',
    image: require('../../../assets/anh_mau2/heroes/teeri.webp'),
  },
  {
    id: 'yue',
    image: require('../../../assets/anh_mau2/heroes/yue.webp'),
  },
  {
    id: 'yan',
    image: require('../../../assets/anh_mau2/heroes/yan.webp'),
  },
  {
    id: 'aya',
    image: require('../../../assets/anh_mau2/heroes/aya.webp'),
  },
  {
    id: 'aoi',
    image: require('../../../assets/anh_mau2/heroes/aoi.webp'),
  },
  {
    id: 'iggy',
    image: require('../../../assets/anh_mau2/heroes/iggy.webp'),
  },
  {
    id: 'bright',
    image: require('../../../assets/anh_mau2/heroes/bright.webp'),
  },
  {
    id: 'lorion',
    image: require('../../../assets/anh_mau2/heroes/lorion.webp'),
  },
  {
    id: 'dextra',
    image: require('../../../assets/anh_mau2/heroes/dextra.webp'),
  },
  {
    id: 'sinestrea',
    image: require('../../../assets/anh_mau2/heroes/sinestrea.webp'),
  },
  {
    id: 'thorne',
    image: require('../../../assets/anh_mau2/heroes/thorne.webp'),
  },
  {
    id: 'allain',
    image: require('../../../assets/anh_mau2/heroes/allain.webp'),
  },
  {
    id: 'zata',
    image: require('../../../assets/anh_mau2/heroes/zata.webp'),
  },
  {
    id: 'rouie',
    image: require('../../../assets/anh_mau2/heroes/rouie.webp'),
  },
  {
    id: 'laville',
    image: require('../../../assets/anh_mau2/heroes/laville.webp'),
  },
  {
    id: 'paine',
    image: require('../../../assets/anh_mau2/heroes/paine.webp'),
  },
  {
    id: 'ata',
    image: require('../../../assets/anh_mau2/heroes/ata.webp'),
  },
  {
    id: 'keera',
    image: require('../../../assets/anh_mau2/heroes/keera.webp'),
  },
  {
    id: 'ishar',
    image: require('../../../assets/anh_mau2/heroes/ishar.webp'),
  },
  {
    id: 'elandorr',
    image: require('../../../assets/anh_mau2/heroes/elandorr.webp'),
  },
  {
    id: 'krizzix',
    image: require('../../../assets/anh_mau2/heroes/krizzix.webp'),
  },
  {
    id: 'volkath',
    image: require('../../../assets/anh_mau2/heroes/volkath.webp'),
  },
  {
    id: 'celica',
    image: require('../../../assets/anh_mau2/heroes/celica.webp'),
  },
  {
    id: 'zip',
    image: require('../../../assets/anh_mau2/heroes/zip.webp'),
  },
  {
    id: 'enzo',
    image: require('../../../assets/anh_mau2/heroes/enzo.webp'),
  },
  {
    id: 'yena',
    image: require('../../../assets/anh_mau2/heroes/yena.webp'),
  },
  {
    id: 'errol',
    image: require('../../../assets/anh_mau2/heroes/errol.webp'),
  },
  {
    id: 'capheny',
    image: require('../../../assets/anh_mau2/heroes/capheny.webp'),
  },
  {
    id: 'hayate',
    image: require('../../../assets/anh_mau2/heroes/hayate.webp'),
  },
  {
    id: 'darcy',
    image: require('../../../assets/anh_mau2/heroes/darcy.webp'),
  },
  {
    id: 'veres',
    image: require('../../../assets/anh_mau2/heroes/veres.webp'),
  },
  {
    id: 'florentino',
    image: require('../../../assets/anh_mau2/heroes/florentino.webp'),
  },
  {
    id: 'sephera',
    image: require('../../../assets/anh_mau2/heroes/sephera.webp'),
  },
  {
    id: 'quillen',
    image: require('../../../assets/anh_mau2/heroes/quillen.webp'),
  },
  {
    id: 'wiro',
    image: require('../../../assets/anh_mau2/heroes/wiro.webp'),
  },
  {
    id: 'richter',
    image: require('../../../assets/anh_mau2/heroes/richter.webp'),
  },
  {
    id: 'elsu',
    image: require('../../../assets/anh_mau2/heroes/elsu.webp'),
  },
  {
    id: 'ybneth',
    image: require('../../../assets/anh_mau2/heroes/ybneth.webp'),
  },
  {
    id: 'amily',
    image: require('../../../assets/anh_mau2/heroes/amily.webp'),
  },
  {
    id: 'annette',
    image: require('../../../assets/anh_mau2/heroes/annette.webp'),
  },
  {
    id: 'baldum',
    image: require('../../../assets/anh_mau2/heroes/baldum.webp'),
  },
  {
    id: 'roxie',
    image: require('../../../assets/anh_mau2/heroes/roxie.webp'),
  },
  {
    id: 'marja',
    image: require('../../../assets/anh_mau2/heroes/marja.webp'),
  },
  {
    id: 'rourke',
    image: require('../../../assets/anh_mau2/heroes/rourke.webp'),
  },
  {
    id: 'arum',
    image: require('../../../assets/anh_mau2/heroes/arum.webp'),
  },
  {
    id: 'wisp',
    image: require('../../../assets/anh_mau2/heroes/wisp.webp'),
  },
  {
    id: 'the-flash',
    image: require('../../../assets/anh_mau2/heroes/the-flash.webp'),
  },
  {
    id: 'max',
    image: require('../../../assets/anh_mau2/heroes/max.webp'),
  },
  {
    id: 'liliana',
    image: require('../../../assets/anh_mau2/heroes/liliana.webp'),
  },
  {
    id: 'tulen',
    image: require('../../../assets/anh_mau2/heroes/tulen.webp'),
  },
  {
    id: 'omen',
    image: require('../../../assets/anh_mau2/heroes/omen.webp'),
  },
  {
    id: 'lindis',
    image: require('../../../assets/anh_mau2/heroes/lindis.webp'),
  },
  {
    id: 'teemee',
    image: require('../../../assets/anh_mau2/heroes/teemee.webp'),
  },
  {
    id: 'moren',
    image: require('../../../assets/anh_mau2/heroes/moren.webp'),
  },
  {
    id: 'kilgroth',
    image: require('../../../assets/anh_mau2/heroes/kilgroth.webp'),
  },
  {
    id: 'xeniel',
    image: require('../../../assets/anh_mau2/heroes/xeniel.webp'),
  },
  {
    id: 'wonder-woman',
    image: require('../../../assets/anh_mau2/heroes/wonder-woman.webp'),
  },
  {
    id: 'superman',
    image: require('../../../assets/anh_mau2/heroes/superman.webp'),
  },
  {
    id: 'telannas',
    image: require('../../../assets/anh_mau2/heroes/telannas.webp'),
  },
  {
    id: 'astrid',
    image: require('../../../assets/anh_mau2/heroes/astrid.webp'),
  },
  {
    id: 'ryoma',
    image: require('../../../assets/anh_mau2/heroes/ryoma.webp'),
  },
  {
    id: 'stuart',
    image: require('../../../assets/anh_mau2/heroes/stuart.webp'),
  },
  {
    id: 'arduin',
    image: require('../../../assets/anh_mau2/heroes/arduin.webp'),
  },
  {
    id: 'zill',
    image: require('../../../assets/anh_mau2/heroes/zill.webp'),
  },
  {
    id: 'murad',
    image: require('../../../assets/anh_mau2/heroes/murad.webp'),
  },
  {
    id: 'ignis',
    image: require('../../../assets/anh_mau2/heroes/ignis.webp'),
  },
  {
    id: 'zuka',
    image: require('../../../assets/anh_mau2/heroes/zuka.webp'),
  },
  {
    id: 'airi',
    image: require('../../../assets/anh_mau2/heroes/airi.webp'),
  },
  {
    id: 'kaine',
    image: require('../../../assets/anh_mau2/heroes/kaine.webp'),
  },
  {
    id: 'lauriel',
    image: require('../../../assets/anh_mau2/heroes/lauriel.webp'),
  },
  {
    id: 'raz',
    image: require('../../../assets/anh_mau2/heroes/raz.webp'),
  },
  {
    id: 'skud',
    image: require('../../../assets/anh_mau2/heroes/skud.webp'),
  },
  {
    id: 'preyta',
    image: require('../../../assets/anh_mau2/heroes/preyta.webp'),
  },
  {
    id: 'ilumia',
    image: require('../../../assets/anh_mau2/heroes/ilumia.webp'),
  },
  {
    id: 'slimz',
    image: require('../../../assets/anh_mau2/heroes/slimz.webp'),
  },
  {
    id: 'arthur',
    image: require('../../../assets/anh_mau2/heroes/arthur.webp'),
  },
  {
    id: 'kriknak',
    image: require('../../../assets/anh_mau2/heroes/kriknak.webp'),
  },
  {
    id: 'ngo-khong',
    image: require('../../../assets/anh_mau2/heroes/ngo-khong.webp'),
  },
  {
    id: 'maloch',
    image: require('../../../assets/anh_mau2/heroes/maloch.webp'),
  },
  {
    id: 'helen',
    image: require('../../../assets/anh_mau2/heroes/helen.webp'),
  },
  {
    id: 'jinna',
    image: require('../../../assets/anh_mau2/heroes/jinna.webp'),
  },
  {
    id: 'cresht',
    image: require('../../../assets/anh_mau2/heroes/cresht.webp'),
  },
  {
    id: 'natalya',
    image: require('../../../assets/anh_mau2/heroes/natalya.webp'),
  },
  {
    id: 'lumburr',
    image: require('../../../assets/anh_mau2/heroes/lumburr.webp'),
  },
  {
    id: 'fennik',
    image: require('../../../assets/anh_mau2/heroes/fennik.webp'),
  },
  {
    id: 'aleister',
    image: require('../../../assets/anh_mau2/heroes/aleister.webp'),
  },
  {
    id: 'grakk',
    image: require('../../../assets/anh_mau2/heroes/grakk.webp'),
  },
  {
    id: 'nakroth',
    image: require('../../../assets/anh_mau2/heroes/nakroth.webp'),
  },
  {
    id: 'taara',
    image: require('../../../assets/anh_mau2/heroes/taara.webp'),
  },
  {
    id: 'toro',
    image: require('../../../assets/anh_mau2/heroes/toro.webp'),
  },
  {
    id: 'yorn',
    image: require('../../../assets/anh_mau2/heroes/yorn.webp'),
  },
  {
    id: 'gildur',
    image: require('../../../assets/anh_mau2/heroes/gildur.webp'),
  },
  {
    id: 'alice',
    image: require('../../../assets/anh_mau2/heroes/alice.webp'),
  },
  {
    id: 'azzenka',
    image: require('../../../assets/anh_mau2/heroes/azzenka.webp'),
  },
  {
    id: 'ormarr',
    image: require('../../../assets/anh_mau2/heroes/ormarr.webp'),
  },
  {
    id: 'butterfly',
    image: require('../../../assets/anh_mau2/heroes/butterfly.webp'),
  },
  {
    id: 'violet',
    image: require('../../../assets/anh_mau2/heroes/violet.webp'),
  },
  {
    id: 'chaugnar',
    image: require('../../../assets/anh_mau2/heroes/chaugnar.webp'),
  },
  {
    id: 'dieu-thuyen',
    image: require('../../../assets/anh_mau2/heroes/dieu-thuyen.webp'),
  },
  {
    id: 'zephys',
    image: require('../../../assets/anh_mau2/heroes/zephys.webp'),
  },
  {
    id: 'kahlii',
    image: require('../../../assets/anh_mau2/heroes/kahlii.webp'),
  },
  {
    id: 'omega',
    image: require('../../../assets/anh_mau2/heroes/omega.webp'),
  },
  {
    id: 'trieu-van',
    image: require('../../../assets/anh_mau2/heroes/trieu-van.webp'),
  },
  {
    id: 'mganga',
    image: require('../../../assets/anh_mau2/heroes/mganga.webp'),
  },
  {
    id: 'krixi',
    image: require('../../../assets/anh_mau2/heroes/krixi.webp'),
  },
  {
    id: 'mina',
    image: require('../../../assets/anh_mau2/heroes/mina.webp'),
  },
  {
    id: 'lu-bo',
    image: require('../../../assets/anh_mau2/heroes/lu-bo.webp'),
  },
  {
    id: 'veera',
    image: require('../../../assets/anh_mau2/heroes/veera.webp'),
  },
  {
    id: 'thane',
    image: require('../../../assets/anh_mau2/heroes/thane.webp'),
  },
  {
    id: 'valhein',
    image: require('../../../assets/anh_mau2/heroes/valhein.webp'),
  },
] as const satisfies readonly HeroVisualDefinition[];

export const HEROES: Hero[] = HERO_VISUAL_CATALOG.map(
  (visual: HeroVisualDefinition) => {
    const definition = heroDefinitionById(visual.id);
    if (!definition) throw new Error(`Unknown hero visual ID: ${visual.id}`);
    const heroClass = heroClassOption(definition.classSlug);
    if (!heroClass) {
      throw new Error(`Unknown hero class: ${definition.classSlug}`);
    }

    return {
      classSlug: definition.classSlug,
      id: definition.id,
      image: visual.image,
      name: definition.name,
      role: heroClass.label,
      ...(visual.variant ? { variant: visual.variant } : {}),
    };
  },
);
