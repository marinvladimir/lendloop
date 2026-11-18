"use client";

import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { LoanList } from "@/components/LoanList";
import { PageTitle, localToday } from "@/components/ui";

export default function IncomingPage() {
  const loans = useQuery(api.loans.incoming, { today: localToday() });
  const approve = useMutation(api.loans.approve);
  const decline = useMutation(api.loans.decline);
  const markReturned = useMutation(api.loans.markReturned);

  return (
    <>
      <PageTitle title="Incoming requests" subtitle="Neighbors who want to borrow your tools." />
      <LoanList
        loans={loans}
        empty="Nobody has asked to borrow your tools yet."
        describe={(loan) => `requested by ${loan.borrowerName}`}
        actions={(loan) => {
          if (loan.status === "requested") {
            return [
              { label: "Decline", variant: "danger", run: () => decline({ loanId: loan._id }) },
              { label: "Approve", variant: "primary", run: () => approve({ loanId: loan._id }) },
            ];
          }
          if (loan.status === "approved") {
            return [{ label: "Mark returned", variant: "secondary", run: () => markReturned({ loanId: loan._id }) }];
          }
          return [];
        }}
      />
    </>
  );
}
