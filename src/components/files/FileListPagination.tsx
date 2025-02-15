
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";

interface FileListPaginationProps {
  table: any;
}

export function FileListPagination({ table }: FileListPaginationProps) {
  return (
    <Pagination>
      <PaginationContent>
        <PaginationItem>
          <PaginationPrevious
            onClick={() => {
              if (table.getCanPreviousPage()) {
                table.previousPage();
              }
            }}
            className={!table.getCanPreviousPage() ? "pointer-events-none opacity-50" : ""}
          />
        </PaginationItem>
        {Array.from({ length: table.getPageCount() }, (_, i) => (
          <PaginationItem key={i}>
            <PaginationLink
              onClick={() => table.setPageIndex(i)}
              isActive={table.getState().pagination.pageIndex === i}
            >
              {i + 1}
            </PaginationLink>
          </PaginationItem>
        ))}
        <PaginationItem>
          <PaginationNext
            onClick={() => {
              if (table.getCanNextPage()) {
                table.nextPage();
              }
            }}
            className={!table.getCanNextPage() ? "pointer-events-none opacity-50" : ""}
          />
        </PaginationItem>
      </PaginationContent>
    </Pagination>
  );
}
