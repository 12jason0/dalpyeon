import {
  Bath, Bed, CupSoda, Droplets, Flower2, Footprints, HeartHandshake, Moon, Salad, Soup, Sun, Wind, type LucideIcon,
} from "lucide-react";
import type { Phase } from "../phase";

export type PhaseContent = { title: string; symptoms: [string, string, string]; tips: { icon: LucideIcon; text: string }[] };

// 일반적인 정보다. 단정하지 말고 "~할 수 있어요"로 쓴다.
export const PHASES: Record<Phase, PhaseContent> = {
  menstrual: {
    title: "생리 중",
    symptoms: ["아랫배가 아플 수 있어요", "쉽게 피로할 수 있어요", "허리가 뻐근할 수 있어요"],
    tips: [
      { icon: Bed, text: "평소보다 일찍 쉬면 도움이 될 수 있어요" },
      { icon: Soup, text: "따뜻한 음식이 편할 수 있어요" },
      { icon: Bath, text: "배를 따뜻하게 하면 나아질 수 있어요" },
    ],
  },
  follicular: {
    title: "난포기",
    symptoms: ["몸이 가벼워질 수 있어요", "생리 때 피로가 줄어들 수 있어요", "피부가 덜 번들거릴 수 있어요"],
    tips: [
      { icon: Footprints, text: "가벼운 산책을 시작하기 좋을 수 있어요" },
      { icon: Salad, text: "채소와 단백질을 챙겨 보면 좋을 수 있어요" },
      { icon: Sun, text: "미뤄둔 일을 해보기 좋은 때일 수 있어요" },
    ],
  },
  fertile: {
    title: "가임기 (추정)",
    symptoms: ["맑은 분비물이 늘 수 있어요", "아랫배가 살짝 당길 수 있어요", "가슴이 민감해질 수 있어요"],
    tips: [
      { icon: Droplets, text: "물을 자주 마시면 좋을 수 있어요" },
      { icon: Flower2, text: "몸의 변화를 가볍게 살펴볼 수 있어요" },
      { icon: HeartHandshake, text: "컨디션을 상대와 나눠 보면 좋을 수 있어요" },
    ],
  },
  luteal: {
    title: "황체기",
    symptoms: ["몸이 부을 수 있어요", "가슴이 아플 수 있어요", "기분이 달라질 수 있어요"],
    tips: [
      { icon: CupSoda, text: "짠 음식과 카페인을 줄이면 편할 수 있어요" },
      { icon: Moon, text: "잠을 충분히 자면 도움이 될 수 있어요" },
      { icon: Wind, text: "천천히 숨 고르는 시간이 좋을 수 있어요" },
    ],
  },
};
