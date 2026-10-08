export type Lang = 'ko' | 'en';

const STRINGS = {
  // prompts
  'take.flour': { ko: '밀가루 한 줌 집기', en: 'Scoop flour' },
  'take.water': { ko: '물 주전자 들기', en: 'Take water' },
  'take.yeast': { ko: '이스트 집기', en: 'Take yeast' },
  'take.butter': { ko: '버터 집기', en: 'Take butter' },
  'mixer.add': { ko: '믹서에 {item} 넣기', en: 'Add {item} to mixer' },
  'mixer.already': { ko: '{item}은(는) 이미 넣었어요', en: '{item} already added' },
  'mixer.start': { ko: '반죽 시작하기', en: 'Start mixing' },
  'mixer.need': { ko: '재료가 더 필요해요: {list}', en: 'Still need: {list}' },
  'mixer.take': { ko: '반죽 꺼내기', en: 'Take the dough' },
  'mixer.busy': { ko: '손이 비어야 해요', en: 'Hands must be empty' },
  'bench.place': { ko: '작업대에 반죽 올리기', en: 'Put dough on bench' },
  'bench.shape': { ko: '분할 · 성형 시작', en: 'Divide & shape' },
  'bench.take': { ko: '트레이 들기', en: 'Pick up tray' },
  'bench.empty': { ko: '반죽을 가져오세요', en: 'Bring dough here' },
  'proofer.place': { ko: '발효기에 넣기', en: 'Put in proofer' },
  'proofer.take': { ko: '발효된 트레이 꺼내기', en: 'Take proofed tray' },
  'proofer.wait': { ko: '발효 중… {pct}%', en: 'Proofing… {pct}%' },
  'oven.place': { ko: '화덕에 넣기', en: 'Put in oven' },
  'oven.take': { ko: '꺼내기!', en: 'Take out!' },
  'oven.busy': { ko: '화덕이 사용 중이에요', en: 'Oven is busy' },
  'oven.peek': { ko: '[우클릭] 화덕 안 들여다보기', en: '[Right-click] Peek inside' },
  'oven.peekHelp': { ko: '[클릭] 꺼내기 · [우클릭/S] 물러나기', en: '[Click] Take out · [Right-click/S] Step back' },
  'oven.unproofed': { ko: '발효가 덜 됐어요 (그래도 넣기)', en: 'Under-proofed (put in anyway)' },
  'display.place': { ko: '바구니에 진열하기', en: 'Fill basket' },
  'display.full': { ko: '바구니가 가득 찼어요', en: 'Basket is full' },
  'display.other': { ko: '다른 빵이 담긴 바구니예요', en: 'Basket holds a different bread' },
  'register.serve': { ko: '계산하기', en: 'Ring up' },
  'register.idle': { ko: '기다리는 손님이 없어요', en: 'No one waiting' },
  'bin.toss': { ko: '버리기', en: 'Throw away' },
  'rack.take': { ko: '빈 트레이 들기', en: 'Take empty tray' },
  'cat.pet': { ko: '쓰다듬기', en: 'Pet the cat' },
  // items
  'item.flour': { ko: '밀가루', en: 'flour' },
  'item.water': { ko: '물', en: 'water' },
  'item.yeast': { ko: '이스트', en: 'yeast' },
  'item.butter': { ko: '버터', en: 'butter' },
  'recipe.roll': { ko: '모닝롤', en: 'Dinner roll' },
  'recipe.baguette': { ko: '바게트', en: 'Baguette' },
  'recipe.croissant': { ko: '크루아상', en: 'Croissant' },
  // minigames
  'mg.mix.title': { ko: '반죽 치대기', en: 'Mix the dough' },
  'mg.mix.help': { ko: '클릭을 누르고 있으면 믹서가 돌아요. 초록 구간에서 손을 떼세요!', en: 'Hold click to run the mixer. Release in the green zone!' },
  'mg.divide.title': { ko: '반죽 나누기', en: 'Divide the dough' },
  'mg.divide.help': { ko: '누르고 있으면 반죽이 떼어져요. 60g에 맞춰 손을 떼세요 ({n}/6)', en: 'Hold to pull dough. Release at 60g ({n}/6)' },
  'mg.round.title': { ko: '동글동글 굴리기', en: 'Round the buns' },
  'mg.round.help': { ko: '마우스로 빵 위에서 원을 그려주세요 ({n}/6)', en: 'Circle the mouse over each bun ({n}/6)' },
  'mg.glaze.title': { ko: '달걀물 바르기', en: 'Egg wash' },
  'mg.glaze.help': { ko: '누른 채로 빵 위를 붓질하세요 · [Space] 완료', en: 'Hold and brush over the buns · [Space] done' },
  'mg.skip': { ko: '[Space] 건너뛰기', en: '[Space] Skip' },
  // grades
  'grade.perfect': { ko: '완벽해요!', en: 'PERFECT!' },
  'grade.great': { ko: '훌륭해요!', en: 'Great!' },
  'grade.good': { ko: '좋아요', en: 'Good' },
  'grade.raw': { ko: '덜 익었어요…', en: 'Underbaked…' },
  'grade.burnt': { ko: '앗, 탔어요!', en: 'Burnt!' },
  // hud
  'hud.day': { ko: '{n}일차', en: 'Day {n}' },
  'hud.recipe': { ko: '오늘의 레시피', en: "Today's recipe" },
  'hud.open': { ko: '영업 중', en: 'Open' },
  'hud.closed': { ko: '영업 종료', en: 'Closed' },
  'step.ingredients': { ko: '재료를 믹서에 넣기', en: 'Add ingredients to mixer' },
  'step.mix': { ko: '반죽 치대기', en: 'Mix the dough' },
  'step.shape': { ko: '작업대에서 나누고 굴리기', en: 'Divide & round on bench' },
  'step.proof': { ko: '발효기에서 부풀리기', en: 'Proof in the cabinet' },
  'step.bake': { ko: '화덕에서 황금빛으로 굽기', en: 'Bake golden in the oven' },
  'step.display': { ko: '바구니에 진열하기', en: 'Fill a display basket' },
  'step.sell': { ko: '손님에게 팔기', en: 'Serve customers' },
  // toasts
  'toast.sold': { ko: '{name} 판매 +₩{price}', en: '{name} sold +₩{price}' },
  'toast.tip': { ko: '팁 +₩{tip}', en: 'Tip +₩{tip}' },
  'toast.left': { ko: '손님이 빵을 못 찾고 돌아갔어요', en: 'A customer left empty-handed' },
  'toast.binned': { ko: '버렸어요', en: 'Thrown away' },
  'toast.cost': { ko: '재료비 -₩{cost}', en: 'Ingredients -₩{cost}' },
  'toast.closing': { ko: '곧 문 닫을 시간이에요', en: 'Closing time soon' },
  // menus
  'menu.start': { ko: '새로 시작', en: 'New Game' },
  'menu.continue': { ko: '이어하기', en: 'Continue' },
  'menu.settings': { ko: '설정', en: 'Settings' },
  'menu.quit': { ko: '종료', en: 'Quit' },
  'menu.resume': { ko: '계속하기', en: 'Resume' },
  'menu.title': { ko: '타이틀로', en: 'Back to title' },
  'menu.paused': { ko: '잠시 쉬는 중', en: 'Paused' },
  'menu.clickToPlay': { ko: '클릭해서 시작', en: 'Click to play' },
  'set.quality': { ko: '그래픽 품질', en: 'Graphics quality' },
  'set.sens': { ko: '마우스 감도', en: 'Mouse sensitivity' },
  'set.master': { ko: '전체 볼륨', en: 'Master volume' },
  'set.music': { ko: '음악', en: 'Music' },
  'set.sfx': { ko: '효과음', en: 'Effects' },
  'set.lang': { ko: '언어', en: 'Language' },
  'set.fullscreen': { ko: '전체 화면', en: 'Fullscreen' },
  'set.close': { ko: '닫기', en: 'Close' },
  'q.low': { ko: '낮음', en: 'Low' },
  'q.medium': { ko: '보통', en: 'Medium' },
  'q.high': { ko: '높음', en: 'High' },
  'q.ultra': { ko: '최고', en: 'Ultra' },
  'ledger.title': { ko: '오늘의 장부', en: "Today's ledger" },
  'ledger.sold': { ko: '판매한 빵', en: 'Breads sold' },
  'ledger.revenue': { ko: '매출', en: 'Revenue' },
  'ledger.tips': { ko: '팁', en: 'Tips' },
  'ledger.costs': { ko: '재료비', en: 'Ingredients' },
  'ledger.profit': { ko: '순이익', en: 'Profit' },
  'ledger.happy': { ko: '행복한 손님', en: 'Happy customers' },
  'ledger.rating': { ko: '평판', en: 'Reputation' },
  'ledger.next': { ko: '다음 날 아침으로', en: 'Next morning' },
  'controls.move': { ko: 'WASD 이동 · 마우스 둘러보기 · 클릭 상호작용 · 우클릭 화덕 들여다보기 · Esc 메뉴', en: 'WASD move · Mouse look · Click interact · Right-click peek oven · Esc menu' },
} as const;

export type StringKey = keyof typeof STRINGS;

let current: Lang = 'ko';

export function setLang(lang: Lang): void {
  current = lang;
}

export function getLang(): Lang {
  return current;
}

export function t(key: StringKey, vars: Record<string, string | number> = {}): string {
  let s: string = STRINGS[key]?.[current] ?? key;
  for (const [k, v] of Object.entries(vars)) s = s.replace(`{${k}}`, String(v));
  return s;
}

export function won(n: number): string {
  return Math.round(n).toLocaleString('ko-KR');
}
