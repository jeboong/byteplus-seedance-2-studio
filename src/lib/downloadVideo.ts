/**
 * Cross-origin 비디오/리소스 다운로드 헬퍼.
 *
 * 왜 필요한가:
 * - 같은 출처가 아닐 때 <a download> 속성은 무시되고 새 탭이 열린다.
 *   그러면 브라우저가 비디오를 다시 처음부터 받아 재생까지 시작하므로
 *   네트워크가 두 배로 든다.
 * - 이 함수는 한 번만 fetch하고 즉시 메모리(object URL)를 해제하므로
 *   "불필요한 다운로드 금지 + 로컬 저장공간 점유 X" 정책에 부합한다.
 *
 * CORS가 막혀 있으면 새 탭으로 fallback. (BytePlus CDN은 일반적으로 CORS 허용)
 */
export async function downloadCrossOrigin(
  url: string,
  filename: string
): Promise<void> {
  try {
    const res = await fetch(url, { mode: "cors", credentials: "omit" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const blob = await res.blob();
    const objUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = objUrl;
    a.download = filename;
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(objUrl), 0);
  } catch {
    window.open(url, "_blank", "noopener,noreferrer");
  }
}

/** BytePlus 비디오 URL의 일반적인 TTL (24시간). */
export const URL_TTL_MS = 24 * 60 * 60 * 1000;

export function isUrlExpired(createdAt: number): boolean {
  return Date.now() - createdAt > URL_TTL_MS;
}
