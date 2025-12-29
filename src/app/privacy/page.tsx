/**
 * Privacy Policy Page
 *
 * Static page displaying the privacy policy.
 */

import { MainLayout } from '@/components/layout';

export default function PrivacyPage(): React.ReactElement {
  return (
    <MainLayout>
      <div className="mx-auto max-w-3xl space-y-8">
        <div>
          <h1 className="text-3xl font-bold text-text-primary">Privacy Policy</h1>
          <p className="mt-2 text-text-muted">Last updated: December 2024</p>
        </div>

        <div className="prose prose-invert max-w-none space-y-6">
          <section className="space-y-4">
            <h2 className="text-xl font-semibold text-text-primary">1. Introduction</h2>
            <p className="text-text-secondary">
              Welcome to BitTorrented (&quot;we,&quot; &quot;our,&quot; or &quot;us&quot;). We are committed to protecting your privacy
              and ensuring the security of your personal information. This Privacy Policy explains how we collect,
              use, disclose, and safeguard your information when you use our service.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-semibold text-text-primary">2. Information We Collect</h2>
            <h3 className="text-lg font-medium text-text-primary">2.1 Account Information</h3>
            <p className="text-text-secondary">
              When you create an account, we collect:
            </p>
            <ul className="list-disc pl-6 text-text-secondary space-y-1">
              <li>Email address</li>
              <li>Password (stored securely using industry-standard hashing)</li>
              <li>Account preferences and settings</li>
            </ul>

            <h3 className="text-lg font-medium text-text-primary">2.2 Usage Information</h3>
            <p className="text-text-secondary">
              We automatically collect certain information when you use our service:
            </p>
            <ul className="list-disc pl-6 text-text-secondary space-y-1">
              <li>IP address (for rate limiting and security purposes)</li>
              <li>Browser type and version</li>
              <li>Device information</li>
              <li>Pages visited and features used</li>
              <li>Timestamps of activity</li>
            </ul>

            <h3 className="text-lg font-medium text-text-primary">2.3 Torrent Metadata</h3>
            <p className="text-text-secondary">
              When you add torrents to the service, we store:
            </p>
            <ul className="list-disc pl-6 text-text-secondary space-y-1">
              <li>Magnet URIs and infohashes</li>
              <li>Torrent names and file metadata</li>
              <li>File sizes and types</li>
            </ul>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-semibold text-text-primary">3. How We Use Your Information</h2>
            <p className="text-text-secondary">
              We use the collected information for the following purposes:
            </p>
            <ul className="list-disc pl-6 text-text-secondary space-y-1">
              <li>To provide and maintain our service</li>
              <li>To authenticate users and manage accounts</li>
              <li>To process payments and manage subscriptions</li>
              <li>To improve and optimize our service</li>
              <li>To detect and prevent fraud or abuse</li>
              <li>To comply with legal obligations</li>
            </ul>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-semibold text-text-primary">4. Data Sharing and Disclosure</h2>
            <p className="text-text-secondary">
              We do not sell your personal information. We may share your information in the following circumstances:
            </p>
            <ul className="list-disc pl-6 text-text-secondary space-y-1">
              <li><strong>Service Providers:</strong> We may share information with third-party service providers
                who assist us in operating our service (e.g., payment processors, hosting providers).</li>
              <li><strong>Legal Requirements:</strong> We may disclose information if required by law or in response
                to valid legal requests.</li>
              <li><strong>Business Transfers:</strong> In the event of a merger, acquisition, or sale of assets,
                your information may be transferred as part of that transaction.</li>
            </ul>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-semibold text-text-primary">5. Data Security</h2>
            <p className="text-text-secondary">
              We implement appropriate technical and organizational measures to protect your personal information,
              including:
            </p>
            <ul className="list-disc pl-6 text-text-secondary space-y-1">
              <li>Encryption of data in transit (HTTPS/TLS)</li>
              <li>Secure password hashing</li>
              <li>Regular security audits and updates</li>
              <li>Access controls and authentication</li>
            </ul>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-semibold text-text-primary">6. Data Retention</h2>
            <p className="text-text-secondary">
              We retain your personal information for as long as your account is active or as needed to provide
              you with our services. You may request deletion of your account and associated data at any time.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-semibold text-text-primary">7. Your Rights</h2>
            <p className="text-text-secondary">
              Depending on your location, you may have the following rights regarding your personal information:
            </p>
            <ul className="list-disc pl-6 text-text-secondary space-y-1">
              <li>Access to your personal data</li>
              <li>Correction of inaccurate data</li>
              <li>Deletion of your data</li>
              <li>Data portability</li>
              <li>Objection to processing</li>
              <li>Withdrawal of consent</li>
            </ul>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-semibold text-text-primary">8. Cookies and Tracking</h2>
            <p className="text-text-secondary">
              We use essential cookies to maintain your session and preferences. We do not use third-party
              tracking cookies or advertising cookies.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-semibold text-text-primary">9. Children&apos;s Privacy</h2>
            <p className="text-text-secondary">
              Our service is not intended for children under 18 years of age. We do not knowingly collect
              personal information from children.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-semibold text-text-primary">10. Changes to This Policy</h2>
            <p className="text-text-secondary">
              We may update this Privacy Policy from time to time. We will notify you of any changes by posting
              the new Privacy Policy on this page and updating the &quot;Last updated&quot; date.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-semibold text-text-primary">11. Contact Us</h2>
            <p className="text-text-secondary">
              If you have any questions about this Privacy Policy, please contact us at:
            </p>
            <p className="text-text-secondary">
              Email: privacy@bittorrented.com
            </p>
          </section>
        </div>
      </div>
    </MainLayout>
  );
}
