import { db } from './src/lib/firebase';
import { collection, getDocs, query, orderBy } from 'firebase/firestore';

async function check() {
  const q = query(collection(db, 'helpers'), orderBy('order', 'asc'));
  const snapshot = await getDocs(q);
  snapshot.docs.forEach(doc => {
    const data = doc.data();
    console.log(`ID: ${doc.id}, Name: ${data.name}, Order: ${data.order}, Deleted: ${data.deleted}`);
  });
}
check();
