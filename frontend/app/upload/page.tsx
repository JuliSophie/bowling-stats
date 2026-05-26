import Navigation from '@/components/navigation';
import UploadView from '@/components/upload-view';

export const metadata = {
  title: 'Upload',
};

export default function UploadPage() {
  return (
    <>
      <Navigation />
      <main className="app-main max-w-5xl">
        <UploadView />
      </main>
    </>
  );
}
