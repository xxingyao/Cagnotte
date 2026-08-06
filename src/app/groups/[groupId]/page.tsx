import { AuthGate } from '@/components/AuthGate';
import { GroupView } from '@/components/GroupView';

export default async function GroupPage({
  params,
}: {
  params: Promise<{ groupId: string }>;
}) {
  const { groupId } = await params;
  return (
    <AuthGate>
      <GroupView groupId={groupId} />
    </AuthGate>
  );
}
