import Header from '@/components/layout/Header'
import Hero from '@/components/sections/Hero'
import CamperCarousel from '@/components/sections/CamperCarousel'
import TripCarousel from '@/components/sections/TripCarousel'
import Features from '@/components/sections/Features'
import CtaBanner from '@/components/sections/CtaBanner'
import Testimonials from '@/components/sections/Testimonials'

export default function Home() {
  return (
    <>
      <Header />
      <Hero />
      <CamperCarousel />
      <TripCarousel />
      <Features />
      <CtaBanner />
      <Testimonials />
    </>
  )
}
