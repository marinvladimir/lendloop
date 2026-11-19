"use client";

import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { LoanList, type LoanAction } from "@/components/LoanList";
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
        actions={(loan): LoanAction[] => {
          const declineAction: LoanAction = {
            label: "Decline",
            variant: "danger",
            done: `Declined. ${loan.borrowerName} has been told.`,
            run: () => decline({ loanId: loan._id }),
          };
          if (loan.status === "requested" && loan.expired) return [declineAction];
          if (loan.status === "requested") {
            return [
              declineAction,
              {
                label: "Approve",
                variant: "primary",
                done: `Approved. ${loan.borrowerName} has been told.`,
                run: () => approve({ loanId: loan._id }),
              },
            ];
          }
          if (loan.status === "approved") {
            return [
              {
                label: "Mark returned",
                variant: "secondary",
                done: `Marked "${loan.toolName}" as returned`,
                run: () => markReturned({ loanId: loan._id }),
              },
            ];
          }
          return [];
        }}
      />
    </>
  );
}
