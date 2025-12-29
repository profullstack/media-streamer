/**
 * Terms of Service Page
 *
 * Static page displaying the terms of service.
 */

import { MainLayout } from '@/components/layout';

export default function TermsPage(): React.ReactElement {
  return (
    <MainLayout>
      <div className="mx-auto max-w-3xl space-y-8">
        <div>
          <h1 className="text-3xl font-bold text-text-primary">Terms of Service</h1>
          <p className="mt-2 text-text-muted">Last updated: December 2024</p>
        </div>

        <div className="prose prose-invert max-w-none space-y-6">
          <section className="space-y-4">
            <h2 className="text-xl font-semibold text-text-primary">1. Acceptance of Terms</h2>
            <p className="text-text-secondary">
              By accessing or using BitTorrented (&quot;the Service&quot;), you agree to be bound by these Terms of Service
              (&quot;Terms&quot;). If you do not agree to these Terms, you may not use the Service.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-semibold text-text-primary">2. Description of Service</h2>
            <p className="text-text-secondary">
              BitTorrented is a media streaming platform that allows users to stream content from torrent files
              and IPTV sources. The Service provides tools for indexing, searching, and streaming media content.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-semibold text-text-primary">3. User Accounts</h2>
            <h3 className="text-lg font-medium text-text-primary">3.1 Account Creation</h3>
            <p className="text-text-secondary">
              To access certain features of the Service, you must create an account. You agree to provide
              accurate, current, and complete information during registration.
            </p>

            <h3 className="text-lg font-medium text-text-primary">3.2 Account Security</h3>
            <p className="text-text-secondary">
              You are responsible for maintaining the confidentiality of your account credentials and for all
              activities that occur under your account. You must notify us immediately of any unauthorized use.
            </p>

            <h3 className="text-lg font-medium text-text-primary">3.3 Account Termination</h3>
            <p className="text-text-secondary">
              We reserve the right to suspend or terminate your account at any time for violation of these Terms
              or for any other reason at our sole discretion.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-semibold text-text-primary">4. User Responsibilities</h2>
            <p className="text-text-secondary">
              By using the Service, you agree to:
            </p>
            <ul className="list-disc pl-6 text-text-secondary space-y-1">
              <li>Comply with all applicable laws and regulations</li>
              <li>Not use the Service for any illegal purposes</li>
              <li>Not infringe upon the intellectual property rights of others</li>
              <li>Not attempt to circumvent any security measures</li>
              <li>Not interfere with or disrupt the Service</li>
              <li>Not use automated systems to access the Service without permission</li>
            </ul>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-semibold text-text-primary">5. Content and Copyright</h2>
            <h3 className="text-lg font-medium text-text-primary">5.1 User Content</h3>
            <p className="text-text-secondary">
              You are solely responsible for any content you access, stream, or share through the Service.
              We do not host or store any copyrighted content on our servers.
            </p>

            <h3 className="text-lg font-medium text-text-primary">5.2 Copyright Compliance</h3>
            <p className="text-text-secondary">
              You agree to use the Service only for content that you have the legal right to access. We respect
              intellectual property rights and expect our users to do the same.
            </p>

            <h3 className="text-lg font-medium text-text-primary">5.3 DMCA Compliance</h3>
            <p className="text-text-secondary">
              We comply with the Digital Millennium Copyright Act (DMCA). If you believe that content accessible
              through our Service infringes your copyright, please contact us with a valid DMCA takedown notice.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-semibold text-text-primary">6. Subscription and Payments</h2>
            <h3 className="text-lg font-medium text-text-primary">6.1 Subscription Plans</h3>
            <p className="text-text-secondary">
              We offer various subscription plans with different features and pricing. Details of each plan
              are available on our pricing page.
            </p>

            <h3 className="text-lg font-medium text-text-primary">6.2 Payment Terms</h3>
            <p className="text-text-secondary">
              Payments are processed through our third-party payment provider. By subscribing, you authorize
              us to charge your payment method for the subscription fees.
            </p>

            <h3 className="text-lg font-medium text-text-primary">6.3 Refunds</h3>
            <p className="text-text-secondary">
              Refund policies vary by subscription type. Please refer to our refund policy for specific details.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-semibold text-text-primary">7. Disclaimer of Warranties</h2>
            <p className="text-text-secondary">
              THE SERVICE IS PROVIDED &quot;AS IS&quot; AND &quot;AS AVAILABLE&quot; WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS
              OR IMPLIED. WE DO NOT WARRANT THAT THE SERVICE WILL BE UNINTERRUPTED, ERROR-FREE, OR SECURE.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-semibold text-text-primary">8. Limitation of Liability</h2>
            <p className="text-text-secondary">
              TO THE MAXIMUM EXTENT PERMITTED BY LAW, WE SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL,
              SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES ARISING OUT OF OR RELATED TO YOUR USE OF THE SERVICE.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-semibold text-text-primary">9. Indemnification</h2>
            <p className="text-text-secondary">
              You agree to indemnify and hold harmless BitTorrented and its affiliates, officers, directors,
              employees, and agents from any claims, damages, losses, or expenses arising from your use of
              the Service or violation of these Terms.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-semibold text-text-primary">10. Modifications to Terms</h2>
            <p className="text-text-secondary">
              We reserve the right to modify these Terms at any time. We will notify users of significant
              changes by posting a notice on the Service or sending an email. Your continued use of the
              Service after such modifications constitutes acceptance of the updated Terms.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-semibold text-text-primary">11. Governing Law</h2>
            <p className="text-text-secondary">
              These Terms shall be governed by and construed in accordance with the laws of the jurisdiction
              in which we operate, without regard to its conflict of law provisions.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-semibold text-text-primary">12. Severability</h2>
            <p className="text-text-secondary">
              If any provision of these Terms is found to be unenforceable or invalid, that provision shall
              be limited or eliminated to the minimum extent necessary, and the remaining provisions shall
              remain in full force and effect.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-semibold text-text-primary">13. Contact Information</h2>
            <p className="text-text-secondary">
              If you have any questions about these Terms, please contact us at:
            </p>
            <p className="text-text-secondary">
              Email: legal@bittorrented.com
            </p>
          </section>
        </div>
      </div>
    </MainLayout>
  );
}
