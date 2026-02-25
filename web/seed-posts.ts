import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

const POSTS = [
  { exam: 'transfer', board: 'qa', title: '건동홍 상경 편입, 진짜 베이스 없으면 1년 컷 불가능한가요? 냉정하게 좀', author_name: '고민중인재수생', content: '합격판 회원분들 안녕하세요.\n\n이번에 편입 관련해서 진짜 궁금한 점이 있어서 글 남깁니다.\n주변에 물어봐도 다 말이 다르고, 인터넷에는 광고밖에 없어서 너무 답답하네요 ㅠㅠ\n\n혹시 경험해 보신 선배님들이나 비슷한 고민 하셨던 분들 계실까요?\n작은 팁이라도 좋으니 댓글 남겨주시면 정말 감사하겠습니다!\n\n(다들 요즘 컨디션 관리 잘 하고 계시죠? 끝까지 파이팅합시다🔥)' },
  { exam: 'transfer', board: 'qa', title: '편입영어 단어장 보카바이블 vs MD 추천좀 (현실적인 조언 부탁)', author_name: '단어지옥', content: '위와 동일...' },
  { exam: 'transfer', board: 'free', title: '와 오늘 도서관에 빌런 진짜 역대급이네 ㅋㅋㅋㅋ', author_name: '아아메충전', content: '다들 열공하시나요?' },
];

async function seed() {
  for (const p of POSTS) {
    // get board id
    const { data: boardRow } = await supabase
      .from('boards')
      .select('id, exams!inner(slug)')
      .eq('slug', p.board)
      .eq('exams.slug', p.exam)
      .single();

    if (boardRow) {
      const { error } = await supabase.from('posts').insert({
        board_id: boardRow.id,
        title: p.title,
        content: p.content,
        author_name: p.author_name,
        user_id: null,
      });
      if (error) {
        console.error('Error inserting:', error);
      } else {
        console.log(`Inserted: ${p.title}`);
      }
    } else {
        console.log(`Board not found for exam: ${p.exam}, board: ${p.board}`);
    }
  }
}

seed();
