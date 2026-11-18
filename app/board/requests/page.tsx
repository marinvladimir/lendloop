"use client";

import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { LoanList } from "@/components/LoanList";
import { PageTitle, localToday } from "@/components/ui";

export default function MyRequestsPage() {
  const loans = useQuery(api.loans.myRequests, { today: localToday() });
  const cancel = useMutation(api.loans.cancel);

  return (
    <>
      <PageTitle title="My requests" subtitle="Things you asked to borrow." />
      <LoanList
        loans={loans}
        empty="You have not asked to borrow anything yet."
        describe={(loan) => `from ${loan.ownerName}`}
        actions={(loan) =>
          loan.status === "requested"
            ? [{ label: "Cancel request", variant: "danger", run: () => cancel({ loanId: loan._id }) }]
            : []
        }
      />
    </>
  );
}
