import { useState } from 'react';
import { useUIStore, type ModalState } from '../../store/uiStore';
import { ExpenseFormModal } from '../expenses/ExpenseFormModal';
import { ExpenseDetailsModal } from '../expenses/ExpenseDetailsModal';
import { BudgetFormModal } from '../budget/BudgetFormModal';
import { PaymentFormModal } from '../payments/PaymentFormModal';
import { PurchaseCheckModal } from '../purchase/PurchaseCheckModal';
import { InviteModal } from '../family/InviteModal';
import { AllowanceFormModal } from '../family/AllowanceFormModal';
import { PurchaseRequestModal } from '../purchase/PurchaseRequestModal';
import { GoalFormModal } from '../goals/GoalFormModal';
import { GoalContributionModal } from '../goals/GoalContributionModal';
import { Presence } from '../ui/Presence';

function renderModal(modal: NonNullable<ModalState>) {
  switch (modal.type) {
    case 'expenseForm':
      return <ExpenseFormModal key={`e-${modal.expenseId ?? 'new'}`} expenseId={modal.expenseId} prefill={modal.prefill} />;
    case 'expenseDetails':
      return <ExpenseDetailsModal key={modal.expenseId} expenseId={modal.expenseId} />;
    case 'budgetForm':
      return <BudgetFormModal focus={modal.focus} purchase={modal.purchase} />;
    case 'paymentForm':
      return <PaymentFormModal key={`p-${modal.paymentId ?? 'new'}`} paymentId={modal.paymentId} prefill={modal.prefill} planned={modal.planned} />;
    case 'purchaseCheck':
      return <PurchaseCheckModal prefill={modal.prefill} />;
    case 'invite':
      return <InviteModal />;
    case 'allowanceForm':
      return <AllowanceFormModal key={modal.memberId} memberId={modal.memberId} />;
    case 'purchaseRequestForm':
      return <PurchaseRequestModal />;
    case 'goalForm':
      return <GoalFormModal key={`g-${modal.goalId ?? 'new'}`} goalId={modal.goalId} />;
    case 'goalContribution':
      return <GoalContributionModal key={modal.goalId} goalId={modal.goalId} />;
  }
}

/**
 * One modal at a time; it is mounted on open, so every form starts from fresh state.
 * After closing, the last modal stays rendered while it animates out.
 */
export function ModalHost() {
  const modal = useUIStore((s) => s.modal);
  const [last, setLast] = useState(modal);
  if (modal && modal !== last) setLast(modal);

  return <Presence show={!!modal}>{last && renderModal(last)}</Presence>;
}
