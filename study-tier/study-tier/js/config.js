// =============================================================
//  서버 연결 설정
//  두 값을 비워 두면 "체험 모드"로 동작합니다(이 기기에만 저장, 가상 친구 포함).
//  Supabase 설정 방법은 README.md 를 보세요.
// =============================================================
export const CONFIG = {
  // 예: 'https://abcdefghijkl.supabase.co'
  SUPABASE_URL: '',
  // Supabase > Project Settings > API Keys 의 "publishable" 키 (또는 legacy "anon public" 키)
  // 이 키는 공개돼도 괜찮습니다. 모든 데이터는 서버 함수와 보안 규칙으로 보호됩니다.
  SUPABASE_KEY: '',
};
