interface PagerProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

// ページ番号 {1, 最終, 現在-1, 現在, 現在+1} を [1, 最終] に収め、昇順で返す。
export function pageNumbersToShow(current: number, last: number): number[] {
  const set = new Set<number>([1, last, current - 1, current, current + 1]);
  return Array.from(set)
    .filter((n) => n >= 1 && n <= last)
    .sort((a, b) => a - b);
}

// 一覧のページ送り(‹ 1 … 4 5 6 … 10 ›)。ページに分ける側(表示する行の切り出し)は、呼び出し側が持つ。
export function Pager({ currentPage, totalPages, onPageChange }: PagerProps) {
  const pageNumbers = pageNumbersToShow(currentPage, totalPages);

  return (
    <div className="pager">
      <button
        type="button"
        className="pager-button pager-arrow"
        aria-label="前のページ"
        disabled={currentPage <= 1}
        onClick={() => onPageChange(currentPage - 1)}
      >
        ‹
      </button>
      {pageNumbers.map((pageNum, i) => {
        const isCurrent = pageNum === currentPage;
        const gap = i > 0 && pageNum - pageNumbers[i - 1] > 1;
        return (
          <span key={pageNum} className="pager-item">
            {gap && (
              <span className="pager-gap" aria-hidden="true">
                …
              </span>
            )}
            <button
              type="button"
              className="pager-button"
              aria-current={isCurrent ? "page" : undefined}
              disabled={isCurrent}
              onClick={() => onPageChange(pageNum)}
            >
              {pageNum}
            </button>
          </span>
        );
      })}
      <button
        type="button"
        className="pager-button pager-arrow"
        aria-label="次のページ"
        disabled={currentPage >= totalPages}
        onClick={() => onPageChange(currentPage + 1)}
      >
        ›
      </button>
    </div>
  );
}
