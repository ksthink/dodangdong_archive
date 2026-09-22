import { createPerson } from '@/lib/people-actions';
import PersonForm from '../person-form';

export default function NewPersonPage() {
  return (
    <main className="page">
      <h1 className="title">인물 등록</h1>
      <p className="measure" style={{ marginTop: 'var(--space-4)' }}>
        식별자는 DP- 로 자동으로 붙는다. 이름만 적어 두고 나머지는 나중에 채워도 된다.
      </p>
      <PersonForm action={createPerson} submitLabel="저장" />
    </main>
  );
}
