import React from 'react';

export const metadata = {
  title: 'Terms of Service',
  description: 'Terms of service for using our application',
};

export default function TermsOfServicePage() {
  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <h1 className="text-3xl font-bold mb-6">Terms of Service</h1>
      
      <div className="prose prose-lg">
        <p className="mb-4">Last Updated: {new Date().toLocaleDateString()}</p>
        
        <h2 className="text-2xl font-semibold mt-6 mb-3">1. Acceptance of Terms</h2>
        <p>By accessing or using our content generation service, you agree to be bound by these Terms of Service. If you do not agree to these terms, please do not use our service.</p>
        
        <h2 className="text-2xl font-semibold mt-6 mb-3">2. Description of Service</h2>
        <p>Our platform provides tools for generating mixed content including images, audio, and video through the use of AI technologies. The service may include third-party APIs and services for content generation.</p>
        
        <h2 className="text-2xl font-semibold mt-6 mb-3">3. User Responsibilities</h2>
        <p>You are responsible for:</p>
        <ul className="list-disc pl-6 mb-4">
          <li>Providing accurate information when using our services</li>
          <li>Using generated content in accordance with applicable laws and regulations</li>
          <li>Not using our service to create harmful, offensive, or illegal content</li>
          <li>Maintaining the security of your account credentials</li>
        </ul>
        
        <h2 className="text-2xl font-semibold mt-6 mb-3">4. Content Ownership</h2>
        <p>You retain ownership of content you create using our service. However, we may use anonymized data to improve our service and underlying models.</p>
        
        <h2 className="text-2xl font-semibold mt-6 mb-3">5. Limitations of Liability</h2>
        <p>Our service is provided "as is" without warranties of any kind. We are not liable for any damages arising from the use of our service, including but not limited to direct, indirect, incidental, or consequential damages.</p>
        
        <h2 className="text-2xl font-semibold mt-6 mb-3">6. Service Changes and Termination</h2>
        <p>We reserve the right to modify, suspend, or discontinue any part of our service at any time. We may also terminate or suspend your access to our service for violations of these terms.</p>
        
        <h2 className="text-2xl font-semibold mt-6 mb-3">7. Governing Law</h2>
        <p>These terms shall be governed by and construed in accordance with the laws of the jurisdiction in which our company operates, without regard to its conflict of law provisions.</p>
        
        <h2 className="text-2xl font-semibold mt-6 mb-3">8. Changes to Terms</h2>
        <p>We may update these terms from time to time. We will notify users of any significant changes by posting the new terms on this page.</p>
        
        <h2 className="text-2xl font-semibold mt-6 mb-3">9. Contact Information</h2>
        <p>If you have any questions about these Terms of Service, please contact us.</p>
      </div>
    </div>
  );
} 