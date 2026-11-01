import { useFamilyStore } from '../../store/familyStore';
import { useUIStore } from '../../store/uiStore';
import { Modal } from '../ui/Modal';
import { InvitePanel } from './InvitePanel';

export function InviteModal() {
  const family = useFamilyStore((s) => s.family);
  const closeModal = useUIStore((s) => s.closeModal);
  if (!family) return null;

  return (
    <Modal
      title="Пригласить в семью"
      description={`По ссылке приглашённый увидит название «${family.name}» и сможет присоединиться.`}
      onClose={closeModal}
    >
      <InvitePanel />
    </Modal>
  );
}
