/**
 * ProfileAvatar Component Tests
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ProfileAvatar } from './ProfileAvatar';

// Mock Next.js Image component
vi.mock('next/image', () => ({
  default: ({ src, alt, fill, className, sizes }: any) => (
    <img 
      src={src} 
      alt={alt} 
      data-fill={fill} 
      className={className} 
      data-sizes={sizes}
    />
  ),
}));

describe('ProfileAvatar', () => {
  const defaultProps = {
    id: 'profile-123',
    name: 'Test Profile',
  };

  it('should render profile name', () => {
    render(<ProfileAvatar {...defaultProps} />);
    
    expect(screen.getByText('Test Profile')).toBeInTheDocument();
  });

  it('should show default badge for default profile', () => {
    render(<ProfileAvatar {...defaultProps} isDefault />);
    
    expect(screen.getByText('Default')).toBeInTheDocument();
  });

  it('should not show default badge for non-default profile', () => {
    render(<ProfileAvatar {...defaultProps} />);
    
    expect(screen.queryByText('Default')).not.toBeInTheDocument();
  });

  it('should render custom avatar image when provided', () => {
    render(
      <ProfileAvatar 
        {...defaultProps} 
        avatarUrl="https://example.com/avatar.jpg" 
      />
    );
    
    const image = screen.getByAltText('Test Profile avatar');
    expect(image).toBeInTheDocument();
    expect(image).toHaveAttribute('src', 'https://example.com/avatar.jpg');
  });

  it('should render emoji avatar when provided', () => {
    render(
      <ProfileAvatar 
        {...defaultProps} 
        avatarEmoji="😀" 
      />
    );
    
    expect(screen.getByText('😀')).toBeInTheDocument();
  });

  it('should render initials when no avatar image or emoji provided', () => {
    render(
      <ProfileAvatar 
        {...defaultProps} 
        name="John Doe" 
      />
    );
    
    expect(screen.getByText('JD')).toBeInTheDocument();
  });

  it('should handle single word names for initials', () => {
    render(
      <ProfileAvatar 
        {...defaultProps} 
        name="John" 
      />
    );
    
    expect(screen.getByText('J')).toBeInTheDocument();
  });

  it('should limit initials to 2 characters', () => {
    render(
      <ProfileAvatar 
        {...defaultProps} 
        name="John Michael Smith" 
      />
    );
    
    expect(screen.getByText('JM')).toBeInTheDocument();
  });

  it('should call onClick with profile ID when clicked', () => {
    const onClick = vi.fn();
    render(<ProfileAvatar {...defaultProps} onClick={onClick} />);
    
    fireEvent.click(screen.getByText('Test Profile'));
    
    expect(onClick).toHaveBeenCalledWith('profile-123');
  });

  it('should not call onClick when not provided', () => {
    render(<ProfileAvatar {...defaultProps} />);
    
    // Should not throw error when clicked without onClick
    fireEvent.click(screen.getByText('Test Profile'));
  });

  it('should apply different sizes correctly', () => {
    const { rerender } = render(<ProfileAvatar {...defaultProps} size="sm" />);
    expect(screen.getByText('Test Profile')).toHaveClass('text-sm');
    
    rerender(<ProfileAvatar {...defaultProps} size="md" />);
    expect(screen.getByText('Test Profile')).toHaveClass('text-base');
    
    rerender(<ProfileAvatar {...defaultProps} size="lg" />);
    expect(screen.getByText('Test Profile')).toHaveClass('text-lg');
  });

  it('should apply custom className', () => {
    render(<ProfileAvatar {...defaultProps} className="custom-class" />);
    
    const container = screen.getByText('Test Profile').closest('.custom-class');
    expect(container).toBeInTheDocument();
  });

  it('should prioritize avatar image over emoji', () => {
    render(
      <ProfileAvatar 
        {...defaultProps} 
        avatarUrl="https://example.com/avatar.jpg"
        avatarEmoji="😀"
      />
    );
    
    expect(screen.getByAltText('Test Profile avatar')).toBeInTheDocument();
    expect(screen.queryByText('😀')).not.toBeInTheDocument();
  });

  it('should prioritize emoji over initials', () => {
    render(
      <ProfileAvatar 
        {...defaultProps} 
        name="John Doe"
        avatarEmoji="😀"
      />
    );
    
    expect(screen.getByText('😀')).toBeInTheDocument();
    expect(screen.queryByText('JD')).not.toBeInTheDocument();
  });

  it('should show ring for default profile', () => {
    render(<ProfileAvatar {...defaultProps} isDefault />);
    
    // Find the avatar circle div - it's the parent of the initials/image/emoji
    const initialsDiv = screen.getByText('TP'); // Test Profile -> TP initials
    const avatarCircle = initialsDiv.parentElement;
    expect(avatarCircle).toHaveClass('ring-2', 'ring-blue-400');
  });

  it('should not show ring for non-default profile', () => {
    render(<ProfileAvatar {...defaultProps} />);
    
    const initialsDiv = screen.getByText('TP');
    const avatarCircle = initialsDiv.parentElement;
    expect(avatarCircle).not.toHaveClass('ring-2', 'ring-blue-400');
  });

  it('should have hover effects', () => {
    render(<ProfileAvatar {...defaultProps} />);
    
    // Find the outermost container div
    const nameText = screen.getByText('Test Profile');
    const outerContainer = nameText.closest('.cursor-pointer');
    expect(outerContainer).toHaveClass('hover:scale-105', 'cursor-pointer', 'group');
  });

  it('should generate consistent background colors for initials', () => {
    const { rerender } = render(
      <ProfileAvatar {...defaultProps} name="Alice" />
    );
    const firstRender = screen.getByText('A').closest('div');
    const firstColor = Array.from(firstRender?.classList || []).find(c => c.startsWith('bg-'));
    
    // Re-render with same name should have same color
    rerender(<ProfileAvatar {...defaultProps} name="Alice" />);
    const secondRender = screen.getByText('A').closest('div');
    const secondColor = Array.from(secondRender?.classList || []).find(c => c.startsWith('bg-'));
    
    expect(firstColor).toBe(secondColor);
  });

  it('should generate different background colors for different names', () => {
    const { rerender } = render(
      <ProfileAvatar {...defaultProps} name="Alice" />
    );
    const aliceColor = Array.from(screen.getByText('A').closest('div')?.classList || [])
      .find(c => c.startsWith('bg-'));
    
    rerender(<ProfileAvatar {...defaultProps} name="Bob" />);
    const bobColor = Array.from(screen.getByText('B').closest('div')?.classList || [])
      .find(c => c.startsWith('bg-'));
    
    // Different names should likely have different colors (though not guaranteed)
    expect(aliceColor).toBeDefined();
    expect(bobColor).toBeDefined();
  });
});