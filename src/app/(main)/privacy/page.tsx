import React from 'react';

export const metadata = {
  title: 'Privacy Policy',
  description: 'Privacy policy for our application',
};

export default function PrivacyPolicyPage() {
  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <h1 className="text-3xl font-bold mb-6">Privacy Policy</h1>
      
      <div className="prose prose-lg">
        <p className="mb-4">Last Updated: {new Date().toLocaleDateString()}</p>
        
        <h2 className="text-2xl font-semibold mt-6 mb-3">1. Information We Collect</h2>
        <p>We collect the following types of information:</p>
        <ul className="list-disc pl-6 mb-4">
          <li><strong>Account Information:</strong> When you register, we collect your email address and password.</li>
          <li><strong>Usage Data:</strong> We collect information about how you use our service, including content you generate.</li>
          <li><strong>Generated Content:</strong> We store the content you create, including images, audio, and video.</li>
          <li><strong>Technical Information:</strong> We collect device information, IP addresses, and browser details to improve our service.</li>
        </ul>
        
        <h2 className="text-2xl font-semibold mt-6 mb-3">2. How We Use Your Information</h2>
        <p>We use your information to:</p>
        <ul className="list-disc pl-6 mb-4">
          <li>Provide and maintain our content generation services</li>
          <li>Improve and personalize your experience</li>
          <li>Process transactions and send related information</li>
          <li>Send notifications related to your account</li>
          <li>Monitor usage patterns and analyze trends</li>
        </ul>
        
        <h2 className="text-2xl font-semibold mt-6 mb-3">3. Information Sharing and Disclosure</h2>
        <p>We do not sell your personal data. We may share information in the following situations:</p>
        <ul className="list-disc pl-6 mb-4">
          <li>With third-party service providers that help us operate our service</li>
          <li>To comply with legal obligations</li>
          <li>To protect the rights, property, or safety of our users or others</li>
          <li>In connection with a business transfer or acquisition</li>
        </ul>
        
        <h2 className="text-2xl font-semibold mt-6 mb-3">4. Data Storage and Security</h2>
        <p>We use Supabase and other secure cloud services to store data. We implement appropriate security measures to protect your information, but no system is completely secure.</p>
        
        <h2 className="text-2xl font-semibold mt-6 mb-3">5. Your Rights and Choices</h2>
        <p>Depending on your location, you may have rights regarding your personal data, including:</p>
        <ul className="list-disc pl-6 mb-4">
          <li>Accessing and updating your information</li>
          <li>Requesting deletion of your data</li>
          <li>Restricting or objecting to processing</li>
          <li>Data portability</li>
        </ul>
        
        <h2 className="text-2xl font-semibold mt-6 mb-3">6. Cookies and Tracking</h2>
        <p>We use cookies and similar technologies to enhance your experience and collect usage information. You can manage cookie preferences through your browser settings.</p>
        
        <h2 className="text-2xl font-semibold mt-6 mb-3">7. Children's Privacy</h2>
        <p>Our service is not intended for children under 13, and we do not knowingly collect information from children under 13.</p>
        
        <h2 className="text-2xl font-semibold mt-6 mb-3">8. Changes to This Policy</h2>
        <p>We may update our Privacy Policy from time to time. We will notify you of significant changes by posting the new policy on this page.</p>
        
        <h2 className="text-2xl font-semibold mt-6 mb-3">9. Contact Us</h2>
        <p>If you have questions about this Privacy Policy, please contact us.</p>
      </div>
    </div>
  );
} 